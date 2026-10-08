import { sql } from 'drizzle-orm';
import { foreignKey, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { organizations } from '../organizations/organizations.schema';
import { secrets } from './secrets.schema';

export const webhookEndpointStatuses = ['ACTIVE', 'DISABLED'] as const;
export type WebhookEndpointStatus = (typeof webhookEndpointStatuses)[number];

// Owned by the integrations module. Where an organization's events are delivered. Tenant-bound
// (RLS in a hand-written migration); the composite foreign key keeps the signing secret in the
// same tenant.
export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    description: text('description'),
    eventTypes: text('event_types').array().notNull(),
    status: text('status', { enum: webhookEndpointStatuses }).notNull().default('ACTIVE'),
    signingSecretId: uuid('signing_secret_id').notNull(),
    // Failed delivery attempts since the last success; the integration worker disables the
    // endpoint when it reaches its threshold (ADR-0023).
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.signingSecretId],
      foreignColumns: [secrets.organizationId, secrets.id],
    }),
  ],
);
