import { sql } from 'drizzle-orm';
import { foreignKey, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { organizations } from '../organizations/organizations.schema';
import { secrets } from './secrets.schema';

export const connectionAuthTypes = ['bearer', 'header'] as const;
export type ConnectionAuthType = (typeof connectionAuthTypes)[number];

// Owned by the integrations module (ADR-0025). Credentials for HTTP steps, bound to the base
// URL they may be sent to. Tenant-bound (RLS in a hand-written migration); the composite
// foreign key keeps the credential in the same tenant.
export const connections = pgTable(
  'connections',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    authType: text('auth_type', { enum: connectionAuthTypes }).notNull(),
    /** The header the credential goes in when `auth_type` is `header`; lower case. */
    headerName: text('header_name'),
    credentialSecretId: uuid('credential_secret_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.name),
    foreignKey({
      columns: [t.organizationId, t.credentialSecretId],
      foreignColumns: [secrets.organizationId, secrets.id],
    }),
  ],
);
