import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

export type Database = NodePgDatabase;

export function createDatabase(_pool: Pool): Database {
  throw new Error('not implemented');
}

export function withTenant<T>(
  _db: Database,
  _organizationId: string,
  _fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return Promise.reject(new Error('not implemented'));
}
