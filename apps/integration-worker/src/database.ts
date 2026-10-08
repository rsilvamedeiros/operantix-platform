import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

export type Database = NodePgDatabase;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export function createDatabase(pool: Pool): Database {
  return drizzle({ client: pool });
}

/**
 * Runs `fn` in a transaction scoped to one tenant (same contract as platform-api, ADR-0017):
 * row-level security only shows and accepts rows of `organizationId`, for this transaction only.
 */
export function withTenant<T>(
  db: Database,
  organizationId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.organization_id', ${organizationId}, true)`);
    await tx.execute(sql`SELECT app_current_organization_id()`);
    return fn(tx);
  });
}
