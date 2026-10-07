import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import type { AppConfig } from '../config/config';
import type { ReadinessCheck } from '../health/readiness';

export function createPostgresPool(config: AppConfig['database'], connectTimeoutMs: number): Pool {
  const logger = new Logger('Postgres');
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.name,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: connectTimeoutMs,
  });
  // An idle client losing its connection emits "error" on the pool; unhandled, it crashes
  // the process. The pool discards that client and readiness reports the outage.
  pool.on('error', (error) => {
    logger.warn(`Idle PostgreSQL client error: ${error.message}`);
  });
  return pool;
}

export function postgresReadinessCheck(pool: Pool): ReadinessCheck {
  return {
    name: 'postgres',
    check: async () => {
      await pool.query('SELECT 1');
    },
  };
}
