import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { recordAudit } from '../audit/audit-log';
import { type Database, type Transaction, withTenant } from '../database/database';
import { DATABASE } from '../database/database.tokens';
import { ExecutionsService, type StartResult } from '../executions/executions.service';
import type { TenantContext } from '../tenancy/tenant-context';
import { workflows } from '../workflows/workflows.schema';
import type {
  CreateInboundWebhookInput,
  InboundWebhookView,
  InboundWebhookWithSecretView,
} from './inbound-webhook.dto';
import { inboundWebhooks } from './inbound-webhooks.schema';
import { verifyWebhookSignature } from './inbound-signature';
import { SecretStore } from './secret-store';
import { newSigningSecret } from './signing-secret';

export class InboundWebhookNotFoundError extends Error {
  override name = 'InboundWebhookNotFoundError';
}
export class InboundWorkflowNotFoundError extends Error {
  override name = 'InboundWorkflowNotFoundError';
}
export class WebhookSignatureInvalidError extends Error {
  override name = 'WebhookSignatureInvalidError';
}

const row = {
  id: inboundWebhooks.id,
  organizationId: inboundWebhooks.organizationId,
  workflowId: inboundWebhooks.workflowId,
  description: inboundWebhooks.description,
  createdAt: inboundWebhooks.createdAt,
};

interface Row {
  id: string;
  organizationId: string;
  workflowId: string;
  description: string | null;
  createdAt: Date;
}

function view({ organizationId, ...hook }: Row): InboundWebhookView {
  return { ...hook, path: `/hooks/v1/${organizationId}/${hook.id}` };
}

/** A delivery whose signature checked out: the webhook it was sent to. */
export interface AuthenticatedDelivery {
  organizationId: string;
  inboundWebhookId: string;
  workflowId: string;
}

// Management queries run under the caller's tenant; deliveries under the tenant in the path.
// Either way RLS keeps ids of other tenants from matching anything.
@Injectable()
export class InboundWebhooksService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly secrets: SecretStore,
    private readonly executions: ExecutionsService,
  ) {}

  list(tenant: TenantContext): Promise<InboundWebhookView[]> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const hooks = await tx
        .select(row)
        .from(inboundWebhooks)
        .orderBy(asc(inboundWebhooks.createdAt), asc(inboundWebhooks.id));
      return hooks.map(view);
    });
  }

  get(tenant: TenantContext, hookId: string): Promise<InboundWebhookView> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const [hook] = await tx
        .select(row)
        .from(inboundWebhooks)
        .where(eq(inboundWebhooks.id, hookId));
      if (!hook) throw new InboundWebhookNotFoundError(hookId);
      return view(hook);
    });
  }

  create(
    tenant: TenantContext,
    input: CreateInboundWebhookInput,
  ): Promise<InboundWebhookWithSecretView> {
    const signingSecret = newSigningSecret();
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const [workflow] = await tx
        .select({ id: workflows.id })
        .from(workflows)
        .where(eq(workflows.id, input.workflowId));
      if (!workflow) throw new InboundWorkflowNotFoundError(input.workflowId);
      const secretId = await this.secrets.create(
        tx,
        tenant.organizationId,
        'WEBHOOK_INBOUND',
        signingSecret,
      );
      const [created] = await tx
        .insert(inboundWebhooks)
        .values({
          organizationId: tenant.organizationId,
          workflowId: input.workflowId,
          description: input.description ?? null,
          signingSecretId: secretId,
        })
        .returning(row);
      if (!created) throw new Error('Inbound webhook insert returned no row');
      await recordAudit(tx, tenant, {
        action: 'inbound_webhook.created',
        resourceType: 'inbound_webhook',
        resourceId: created.id,
        metadata: { workflowId: created.workflowId },
      });
      return { ...view(created), signingSecret };
    });
  }

  /** Replaces the signing secret at once: deliveries signed with the old one are refused. */
  rotateSecret(tenant: TenantContext, hookId: string): Promise<InboundWebhookWithSecretView> {
    const signingSecret = newSigningSecret();
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const previous = await lockSecretId(tx, hookId);
      const secretId = await this.secrets.create(
        tx,
        tenant.organizationId,
        'WEBHOOK_INBOUND',
        signingSecret,
      );
      const [rotated] = await tx
        .update(inboundWebhooks)
        .set({ signingSecretId: secretId })
        .where(eq(inboundWebhooks.id, hookId))
        .returning(row);
      if (!rotated) throw new InboundWebhookNotFoundError(hookId);
      await this.secrets.remove(tx, previous);
      await recordAudit(tx, tenant, {
        action: 'inbound_webhook.secret_rotated',
        resourceType: 'inbound_webhook',
        resourceId: hookId,
      });
      return { ...view(rotated), signingSecret };
    });
  }

  remove(tenant: TenantContext, hookId: string): Promise<void> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const [deleted] = await tx
        .delete(inboundWebhooks)
        .where(eq(inboundWebhooks.id, hookId))
        .returning({
          workflowId: inboundWebhooks.workflowId,
          secretId: inboundWebhooks.signingSecretId,
        });
      if (!deleted) throw new InboundWebhookNotFoundError(hookId);
      await this.secrets.remove(tx, deleted.secretId);
      await recordAudit(tx, tenant, {
        action: 'inbound_webhook.deleted',
        resourceType: 'inbound_webhook',
        resourceId: hookId,
        metadata: { workflowId: deleted.workflowId },
      });
    });
  }

  /**
   * Checks a delivery's signature against the webhook's secret. Unknown webhooks and bad
   * signatures are distinct errors; the reason a signature failed is never told.
   */
  authenticate(
    organizationId: string,
    hookId: string,
    signature: string | undefined,
    rawBody: Buffer,
    now: Date,
  ): Promise<AuthenticatedDelivery> {
    return withTenant(this.db, organizationId, async (tx) => {
      const [hook] = await tx
        .select({
          workflowId: inboundWebhooks.workflowId,
          secretId: inboundWebhooks.signingSecretId,
        })
        .from(inboundWebhooks)
        .where(eq(inboundWebhooks.id, hookId));
      if (!hook) throw new InboundWebhookNotFoundError(hookId);
      const secret = await this.secrets.openInbound(tx, organizationId, hook.secretId);
      if (secret === undefined) throw new InboundWebhookNotFoundError(hookId);
      if (!verifyWebhookSignature(signature, rawBody, secret, now)) {
        throw new WebhookSignatureInvalidError(hookId);
      }
      return { organizationId, inboundWebhookId: hookId, workflowId: hook.workflowId };
    });
  }

  /**
   * Starts the webhook's workflow with the payload as input. The sender's key is scoped to the
   * webhook, so two webhooks of one workflow never collide.
   */
  start(
    delivery: AuthenticatedDelivery,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<StartResult> {
    return this.executions.startTriggered(
      delivery.organizationId,
      delivery.workflowId,
      { type: 'webhook', inboundWebhookId: delivery.inboundWebhookId },
      { input: payload },
      `inbound:${delivery.inboundWebhookId}:${idempotencyKey}`,
    );
  }
}

async function lockSecretId(tx: Transaction, hookId: string): Promise<string> {
  const [hook] = await tx
    .select({ secretId: inboundWebhooks.signingSecretId })
    .from(inboundWebhooks)
    .where(eq(inboundWebhooks.id, hookId))
    .for('update');
  if (!hook) throw new InboundWebhookNotFoundError(hookId);
  return hook.secretId;
}
