import { pgTable, uuid } from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', { id: uuid('id').primaryKey() });
export const workspaces = pgTable('workspaces', { id: uuid('id').primaryKey() });
