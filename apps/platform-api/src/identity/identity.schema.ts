import { pgTable, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', { id: uuid('id').primaryKey() });
export const memberships = pgTable('memberships', { id: uuid('id').primaryKey() });
