import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Owned by the audit module. Tenant-bound and append-only: RLS and a trigger that rejects
// UPDATE/DELETE live in a hand-written migration. No foreign keys, so entries outlive the
// rows they describe; retention is decided per docs/data/retention.md.
export const auditEntries = pgTable(
  'audit_entries',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.organizationId, t.occurredAt)],
);
