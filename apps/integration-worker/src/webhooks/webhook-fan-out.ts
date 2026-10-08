import type { AnyEvent } from '@operantix/contracts';
import { and, arrayContains, eq } from 'drizzle-orm';
import { type Database, withTenant } from '../database';
import { webhookDeliveries, webhookEndpoints } from '../integration.schema';

/**
 * Turns one consumed event into a queued delivery per active endpoint subscribed to its type,
 * inside the event's tenant. The (endpoint, event) unique key makes a redelivered event a no-op,
 * so the Kafka consumer can be at-least-once.
 */
export class WebhookFanOut {
  constructor(private readonly db: Database) {}

  /** Returns how many deliveries were queued. */
  handle(event: AnyEvent): Promise<number> {
    return withTenant(this.db, event.tenant.organizationId, async (tx) => {
      const endpoints = await tx
        .select({ id: webhookEndpoints.id })
        .from(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.status, 'ACTIVE'),
            arrayContains(webhookEndpoints.eventTypes, [event.eventType]),
          ),
        );
      if (endpoints.length === 0) return 0;
      const queued = await tx
        .insert(webhookDeliveries)
        .values(
          endpoints.map((endpoint) => ({
            organizationId: event.tenant.organizationId,
            endpointId: endpoint.id,
            eventId: event.eventId,
            eventType: event.eventType,
            payload: event,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: webhookDeliveries.id });
      return queued.length;
    });
  }
}
