import { sql } from 'drizzle-orm';
import { foreignKey, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { organizations } from '../organizations/organizations.schema';
import { workflows } from '../workflows/workflows.schema';
import { secrets } from './secrets.schema';

// Owned by the integrations module (ADR-0024). A signed public URL that starts one workflow.
// Tenant-bound (RLS in a hand-written migration); composite foreign keys keep the workflow and
// the signing secret in the same tenant.
export const inboundWebhooks = pgTable(
  'inbound_webhooks',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workflowId: uuid('workflow_id').notNull(),
    description: text('description'),
    signingSecretId: uuid('signing_secret_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    foreignKey({
      columns: [t.organizationId, t.workflowId],
      foreignColumns: [workflows.organizationId, workflows.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.organizationId, t.signingSecretId],
      foreignColumns: [secrets.organizationId, secrets.id],
    }),
  ],
);
