import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../audit/audit-log';
import { type Database, type Transaction, withTenant } from '../database/database';
import { DATABASE } from '../database/database.tokens';
import { decodeCursor, encodeCursor } from '../shared/keyset-cursor';
import type { TenantContext } from '../tenancy/tenant-context';
import type {
  ListWebhookDeliveriesQuery,
  WebhookDeliveryDetailView,
  WebhookDeliveryPage,
  WebhookDeliveryView,
} from './webhook-delivery.dto';
import { webhookDeliveries, webhookDeliveryAttempts } from './webhook-deliveries.schema';
import { WebhookEndpointNotFoundError } from './webhook-endpoints.service';
import { type WebhookEndpointStatus, webhookEndpoints } from './webhook-endpoints.schema';

export class WebhookDeliveryNotFoundError extends Error {
  override name = 'WebhookDeliveryNotFoundError';
}
export class WebhookDeliveryNotFailedError extends Error {
  override name = 'WebhookDeliveryNotFailedError';
}
export class WebhookEndpointDisabledError extends Error {
  override name = 'WebhookEndpointDisabledError';
}

const deliveryView = {
  id: webhookDeliveries.id,
  endpointId: webhookDeliveries.endpointId,
  eventId: webhookDeliveries.eventId,
  eventType: webhookDeliveries.eventType,
  status: webhookDeliveries.status,
  attempts: webhookDeliveries.attempts,
  nextAttemptAt: webhookDeliveries.nextAttemptAt,
  lastStatusCode: webhookDeliveries.lastStatusCode,
  lastErrorCode: webhookDeliveries.lastErrorCode,
  createdAt: webhookDeliveries.createdAt,
  completedAt: webhookDeliveries.completedAt,
};

/**
 * Read side of the delivery queue the integration worker writes (ADR-0023), plus manual retry.
 * Every query runs under the tenant's RLS scope and is also filtered by endpoint, so a delivery
 * is only reachable through the endpoint it belongs to.
 */
@Injectable()
export class WebhookDeliveriesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Deliveries of an endpoint, newest first, with an opaque keyset cursor. */
  async list(
    tenant: TenantContext,
    endpointId: string,
    query: ListWebhookDeliveriesQuery,
  ): Promise<WebhookDeliveryPage> {
    const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    return await withTenant(this.db, tenant.organizationId, async (tx) => {
      await endpointStatus(tx, endpointId);
      const page = await tx
        .select(deliveryView)
        .from(webhookDeliveries)
        .where(
          and(
            eq(webhookDeliveries.endpointId, endpointId),
            after === undefined
              ? undefined
              : sql`(${webhookDeliveries.createdAt}, ${webhookDeliveries.id}) < (SELECT created_at, id FROM webhook_deliveries WHERE id = ${after})`,
          ),
        )
        .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
        .limit(query.limit + 1);
      const data = page.slice(0, query.limit);
      const last = data.at(-1);
      return {
        data,
        nextCursor: page.length > query.limit && last ? encodeCursor(last.id) : null,
      };
    });
  }

  /** A delivery with every attempt, oldest first. */
  get(
    tenant: TenantContext,
    endpointId: string,
    deliveryId: string,
  ): Promise<WebhookDeliveryDetailView> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      await endpointStatus(tx, endpointId);
      const [delivery] = await tx
        .select(deliveryView)
        .from(webhookDeliveries)
        .where(
          and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.endpointId, endpointId)),
        );
      if (!delivery) throw new WebhookDeliveryNotFoundError(deliveryId);
      return withHistory(tx, delivery);
    });
  }

  /**
   * Puts a failed delivery back in the queue as new: attempts start over and it is due now.
   * Earlier attempts stay in the history. Only an active endpoint takes retries, since the
   * worker would skip a disabled one anyway.
   */
  retry(
    tenant: TenantContext,
    endpointId: string,
    deliveryId: string,
  ): Promise<WebhookDeliveryDetailView> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const status = await endpointStatus(tx, endpointId);
      const [delivery] = await tx
        .select({
          status: webhookDeliveries.status,
          lastErrorCode: webhookDeliveries.lastErrorCode,
        })
        .from(webhookDeliveries)
        .where(
          and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.endpointId, endpointId)),
        )
        .for('update');
      if (!delivery) throw new WebhookDeliveryNotFoundError(deliveryId);
      if (status !== 'ACTIVE') throw new WebhookEndpointDisabledError(endpointId);
      if (delivery.status !== 'FAILED') throw new WebhookDeliveryNotFailedError(deliveryId);

      const [requeued] = await tx
        .update(webhookDeliveries)
        .set({
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: sql`now()`,
          leaseExpiresAt: null,
          completedAt: null,
        })
        .where(eq(webhookDeliveries.id, deliveryId))
        .returning(deliveryView);
      if (!requeued) throw new WebhookDeliveryNotFoundError(deliveryId);
      await recordAudit(tx, tenant, {
        action: 'webhook_delivery.retried',
        resourceType: 'webhook_delivery',
        resourceId: deliveryId,
        metadata: { endpointId, lastErrorCode: delivery.lastErrorCode },
      });
      return withHistory(tx, requeued);
    });
  }
}

async function endpointStatus(tx: Transaction, endpointId: string): Promise<WebhookEndpointStatus> {
  const [endpoint] = await tx
    .select({ status: webhookEndpoints.status })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, endpointId));
  if (!endpoint) throw new WebhookEndpointNotFoundError(endpointId);
  return endpoint.status;
}

async function withHistory(
  tx: Transaction,
  delivery: WebhookDeliveryView,
): Promise<WebhookDeliveryDetailView> {
  const attemptHistory = await tx
    .select({
      attempt: webhookDeliveryAttempts.attempt,
      statusCode: webhookDeliveryAttempts.statusCode,
      errorCode: webhookDeliveryAttempts.errorCode,
      durationMs: webhookDeliveryAttempts.durationMs,
      attemptedAt: webhookDeliveryAttempts.attemptedAt,
    })
    .from(webhookDeliveryAttempts)
    .where(eq(webhookDeliveryAttempts.deliveryId, delivery.id))
    // A retried delivery numbers its attempts from 1 again, so time orders them first.
    .orderBy(asc(webhookDeliveryAttempts.attemptedAt), asc(webhookDeliveryAttempts.attempt));
  return { ...delivery, attemptHistory };
}
