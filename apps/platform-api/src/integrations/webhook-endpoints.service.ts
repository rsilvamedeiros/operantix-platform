import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { recordAudit } from '../audit/audit-log';
import { type Database, type Transaction, withTenant } from '../database/database';
import { DATABASE } from '../database/database.tokens';
import type { TenantContext } from '../tenancy/tenant-context';
import { SecretStore } from './secret-store';
import { newSigningSecret } from './signing-secret';
import type {
  CreateWebhookEndpointInput,
  SetWebhookEndpointStatusInput,
  WebhookEndpointView,
  WebhookEndpointWithSecretView,
} from './webhook-endpoint.dto';
import { webhookEndpoints } from './webhook-endpoints.schema';

export class WebhookEndpointNotFoundError extends Error {
  override name = 'WebhookEndpointNotFoundError';
}

const endpointView = {
  id: webhookEndpoints.id,
  url: webhookEndpoints.url,
  description: webhookEndpoints.description,
  eventTypes: webhookEndpoints.eventTypes,
  status: webhookEndpoints.status,
  consecutiveFailures: webhookEndpoints.consecutiveFailures,
  createdAt: webhookEndpoints.createdAt,
};

// All queries run under the tenant's RLS scope; ids of other tenants simply match nothing.
@Injectable()
export class WebhookEndpointsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly secrets: SecretStore,
  ) {}

  list(tenant: TenantContext): Promise<WebhookEndpointView[]> {
    return withTenant(this.db, tenant.organizationId, (tx) =>
      tx
        .select(endpointView)
        .from(webhookEndpoints)
        .orderBy(asc(webhookEndpoints.createdAt), asc(webhookEndpoints.id)),
    );
  }

  get(tenant: TenantContext, endpointId: string): Promise<WebhookEndpointView> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const [endpoint] = await tx
        .select(endpointView)
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, endpointId));
      if (!endpoint) throw new WebhookEndpointNotFoundError(endpointId);
      return endpoint;
    });
  }

  create(
    tenant: TenantContext,
    input: CreateWebhookEndpointInput,
  ): Promise<WebhookEndpointWithSecretView> {
    const signingSecret = newSigningSecret();
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const secretId = await this.secrets.create(
        tx,
        tenant.organizationId,
        'WEBHOOK_SIGNING',
        signingSecret,
      );
      const [created] = await tx
        .insert(webhookEndpoints)
        .values({
          organizationId: tenant.organizationId,
          url: input.url,
          description: input.description ?? null,
          eventTypes: input.eventTypes,
          signingSecretId: secretId,
        })
        .returning(endpointView);
      if (!created) throw new Error('Webhook endpoint insert returned no row');
      await recordAudit(tx, tenant, {
        action: 'webhook_endpoint.created',
        resourceType: 'webhook_endpoint',
        resourceId: created.id,
        metadata: { url: created.url, eventTypes: created.eventTypes },
      });
      return { ...created, signingSecret };
    });
  }

  /** Replaces the signing secret at once: deliveries signed after this use the new one. */
  rotateSecret(tenant: TenantContext, endpointId: string): Promise<WebhookEndpointWithSecretView> {
    const signingSecret = newSigningSecret();
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const previous = await lockSecretId(tx, endpointId);
      const secretId = await this.secrets.create(
        tx,
        tenant.organizationId,
        'WEBHOOK_SIGNING',
        signingSecret,
      );
      const [rotated] = await tx
        .update(webhookEndpoints)
        .set({ signingSecretId: secretId })
        .where(eq(webhookEndpoints.id, endpointId))
        .returning(endpointView);
      if (!rotated) throw new WebhookEndpointNotFoundError(endpointId);
      await this.secrets.remove(tx, previous);
      await recordAudit(tx, tenant, {
        action: 'webhook_endpoint.secret_rotated',
        resourceType: 'webhook_endpoint',
        resourceId: endpointId,
      });
      return { ...rotated, signingSecret };
    });
  }

  /**
   * Enables or disables an endpoint. Enabling clears the failure count, so the breaker starts
   * over; setting the current status again changes nothing and is not audited.
   */
  setStatus(
    tenant: TenantContext,
    endpointId: string,
    input: SetWebhookEndpointStatusInput,
  ): Promise<WebhookEndpointView> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const [current] = await tx
        .select(endpointView)
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, endpointId))
        .for('update');
      if (!current) throw new WebhookEndpointNotFoundError(endpointId);
      if (current.status === input.status) return current;
      const [updated] = await tx
        .update(webhookEndpoints)
        .set(
          input.status === 'ACTIVE'
            ? { status: 'ACTIVE', consecutiveFailures: 0 }
            : { status: 'DISABLED' },
        )
        .where(eq(webhookEndpoints.id, endpointId))
        .returning(endpointView);
      if (!updated) throw new WebhookEndpointNotFoundError(endpointId);
      await recordAudit(tx, tenant, {
        action:
          input.status === 'ACTIVE' ? 'webhook_endpoint.enabled' : 'webhook_endpoint.disabled',
        resourceType: 'webhook_endpoint',
        resourceId: endpointId,
        metadata: { consecutiveFailures: current.consecutiveFailures },
      });
      return updated;
    });
  }

  remove(tenant: TenantContext, endpointId: string): Promise<void> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const [deleted] = await tx
        .delete(webhookEndpoints)
        .where(eq(webhookEndpoints.id, endpointId))
        .returning({ url: webhookEndpoints.url, secretId: webhookEndpoints.signingSecretId });
      if (!deleted) throw new WebhookEndpointNotFoundError(endpointId);
      await this.secrets.remove(tx, deleted.secretId);
      await recordAudit(tx, tenant, {
        action: 'webhook_endpoint.deleted',
        resourceType: 'webhook_endpoint',
        resourceId: endpointId,
        metadata: { url: deleted.url },
      });
    });
  }
}

async function lockSecretId(tx: Transaction, endpointId: string): Promise<string> {
  const [endpoint] = await tx
    .select({ secretId: webhookEndpoints.signingSecretId })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, endpointId))
    .for('update');
  if (!endpoint) throw new WebhookEndpointNotFoundError(endpointId);
  return endpoint.secretId;
}
