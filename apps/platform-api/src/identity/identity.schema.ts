import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { organizations } from '../organizations/organizations.schema';

// Owned by the identity module. Users are global (one person, many organizations);
// memberships are tenant-bound and protected by RLS (ADR-0017).

export const roles = ['OWNER', 'ADMIN', 'DEVELOPER', 'OPERATOR', 'VIEWER'] as const;
export type Role = (typeof roles)[number];
export const roleEnum = pgEnum('role', roles);

export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  // `sub` claim of the identity provider; the link between a token and a user.
  authSubject: text('auth_subject').notNull().unique(),
  // Profile claims are optional in access tokens, so they may be unknown.
  email: text('email'),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.organizationId, t.userId), index().on(t.userId)],
);
