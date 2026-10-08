import { sql } from 'drizzle-orm';
import { customType, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { organizations } from '../organizations/organizations.schema';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const secretKinds = ['WEBHOOK_SIGNING', 'WEBHOOK_INBOUND'] as const;
export type SecretKind = (typeof secretKinds)[number];

// Owned by the integrations module (ADR-0022). Only ciphertext is stored: the value is sealed
// with the keyring's active key, bound to `<organization_id>/<id>`. Tenant-bound (RLS in a
// hand-written migration). Rows are replaced, never updated, so a rotation leaves no plaintext
// path behind.
export const secrets = pgTable(
  'secrets',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: secretKinds }).notNull(),
    keyId: text('key_id').notNull(),
    ciphertext: bytea('ciphertext').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.organizationId, t.id)],
);
