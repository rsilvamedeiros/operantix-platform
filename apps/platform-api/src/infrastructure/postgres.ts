import { Pool } from 'pg';
import type { AppConfig } from '../config/config';
import type { ReadinessCheck } from '../health/readiness';

export function createPostgresPool(config: AppConfig['database'], connectTimeoutMs: number): Pool {
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.name,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: connectTimeoutMs,
  });
}

export function postgresReadinessCheck(pool: Pool): ReadinessCheck {
  return {
    name: 'postgres',
    check: async () => {
      await pool.query('SELECT 1');
    },
  };
}
