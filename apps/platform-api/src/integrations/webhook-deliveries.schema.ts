import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { webhookEndpoints } from './webhook-endpoints.schema';

export const webhookDeliveryStatuses = ['PENDING', 'SUCCEEDED', 'FAILED'] as const;
export type WebhookDeliveryStatus = (typeof webhookDeliveryStatuses)[number];

// Owned by the integrations module; written by the integration worker (ADR-0023). One row per
// (endpoint, event): the unique key makes fan-out idempotent under at-least-once consumption.
// Also the delivery queue: due rows are claimed with SKIP LOCKED and a lease.
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id').notNull(),
    endpointId: uuid('endpoint_id').notNull(),
    eventId: uuid('event_id').notNull(),
    eventType: text('event_type').notNull(),
    /** The event envelope exactly as consumed; posted as the request body. */
    payload: jsonb('payload').notNull(),
    status: text('status', { enum: webhookDeliveryStatuses }).notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    lastStatusCode: integer('last_status_code'),
    lastErrorCode: text('last_error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    unique().on(t.endpointId, t.eventId),
    unique().on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.endpointId],
      foreignColumns: [webhookEndpoints.organizationId, webhookEndpoints.id],
    }).onDelete('cascade'),
    index('webhook_deliveries_due_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'PENDING'`),
  ],
);

// Append-only history of every attempt (status or error code and duration, never bodies).
export const webhookDeliveryAttempts = pgTable(
  'webhook_delivery_attempts',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id').notNull(),
    deliveryId: uuid('delivery_id').notNull(),
    attempt: integer('attempt').notNull(),
    statusCode: integer('status_code'),
    errorCode: text('error_code'),
    durationMs: integer('duration_ms').notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.deliveryId],
      foreignColumns: [webhookDeliveries.organizationId, webhookDeliveries.id],
    }).onDelete('cascade'),
    index('webhook_delivery_attempts_delivery_idx').on(t.deliveryId),
  ],
);
