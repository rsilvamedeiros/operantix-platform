import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

export type Database = NodePgDatabase;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export function createDatabase(pool: Pool): Database {
  return drizzle({ client: pool });
}

/**
 * Runs `fn` in a transaction scoped to one tenant. Row-level security only returns and
 * accepts rows of `organizationId`; the setting is transaction-local (`is_local = true`),
 * so it never leaks to the next request that reuses the pooled connection.
 */
export function withTenant<T>(
  db: Database,
  organizationId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.organization_id', ${organizationId}, true)`);
    // Fail fast on a malformed id rather than letting the policy cast fail mid-query.
    await tx.execute(sql`SELECT app_current_organization_id()`);
    return fn(tx);
  });
}

const UNIQUE_VIOLATION = '23505';

/** Whether `error` (as thrown by Drizzle, which wraps the driver error) is a unique violation. */
export function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === UNIQUE_VIOLATION
  );
}

export function withUser<T>(
  _db: Database,
  _userId: string,
  _fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  throw new Error('Not implemented');
}
