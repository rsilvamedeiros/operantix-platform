import { customType, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// platform-api owns these tables and their migrations (ADR-0023). Only the columns the
// integration worker uses are declared, and its role is granted exactly those.

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  url: text('url').notNull(),
  eventTypes: text('event_types').array().notNull(),
  status: text('status', { enum: ['ACTIVE', 'DISABLED'] }).notNull(),
  signingSecretId: uuid('signing_secret_id').notNull(),
  consecutiveFailures: integer('consecutive_failures').notNull(),
});

export const secrets = pgTable('secrets', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  keyId: text('key_id').notNull(),
  ciphertext: bytea('ciphertext').notNull(),
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  endpointId: uuid('endpoint_id').notNull(),
  eventId: uuid('event_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status', { enum: ['PENDING', 'SUCCEEDED', 'FAILED'] })
    .notNull()
    .default('PENDING'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  lastStatusCode: integer('last_status_code'),
  lastErrorCode: text('last_error_code'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const webhookDeliveryAttempts = pgTable('webhook_delivery_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  deliveryId: uuid('delivery_id').notNull(),
  attempt: integer('attempt').notNull(),
  statusCode: integer('status_code'),
  errorCode: text('error_code'),
  durationMs: integer('duration_ms').notNull(),
});
