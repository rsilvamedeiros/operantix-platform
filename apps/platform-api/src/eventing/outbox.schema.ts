import { sql } from 'drizzle-orm';
import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from '../organizations/organizations.schema';

// Transactional outbox (ADR-0011). A producer inserts the event in the same transaction as the
// state change it describes; a relay publishes unpublished rows to Kafka in `id` order.
// Tenant-bound for writers (RLS in a hand-written migration).
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    // The envelope's eventId: consumers deduplicate on it, so a re-publish is harmless.
    eventId: uuid('event_id').notNull().unique(),
    topic: text('topic').notNull(),
    partitionKey: text('partition_key').notNull(),
    eventType: text('event_type').notNull(),
    // The full envelope, validated against @operantix/contracts before it is written.
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    // The relay's scan: oldest unpublished first.
    index('outbox_events_unpublished_index')
      .on(t.id)
      .where(sql`${t.publishedAt} IS NULL`),
  ],
);
