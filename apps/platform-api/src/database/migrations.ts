import type { Pool } from 'pg';

export function runMigrations(_pool: Pool): Promise<void> {
  return Promise.reject(new Error('not implemented'));
}
