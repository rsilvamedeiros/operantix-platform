import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { createDatabase } from './database';

export const MIGRATIONS_FOLDER = resolve(__dirname, '../../migrations');

/** Applies pending migrations. Must run with the schema owner, never the API role. */
export async function runMigrations(pool: Pool): Promise<void> {
  await migrate(createDatabase(pool), { migrationsFolder: MIGRATIONS_FOLDER });
}
