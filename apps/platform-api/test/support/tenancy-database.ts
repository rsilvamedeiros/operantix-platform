import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { runMigrations } from '../../src/database/migrations';

const APP_ROLE_SQL = resolve(__dirname, '../../../../infrastructure/docker/postgres/app-role.sql');

export interface TenancyDatabase {
  container: StartedPostgreSqlContainer;
  /** Schema owner (superuser in the container): bypasses RLS, for seeding and assertions. */
  ownerPool: Pool;
  /** Credentials of the API role, which is subject to RLS. */
  app: { host: string; port: number; name: string; user: string; password: string };
  stop(): Promise<void>;
}

/** PostgreSQL with the same API role as local dev (compose init script) and all migrations. */
export async function startTenancyDatabase(): Promise<TenancyDatabase> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const ownerPool = new Pool({ connectionString: container.getConnectionUri() });
  const password = randomUUID();
  const roleSql = readFileSync(APP_ROLE_SQL, 'utf8').replace(":'app_password'", `'${password}'`);
  await ownerPool.query(roleSql);
  await runMigrations(ownerPool);

  return {
    container,
    ownerPool,
    app: {
      host: container.getHost(),
      port: container.getPort(),
      name: container.getDatabase(),
      user: 'operantix_app',
      password,
    },
    stop: async () => {
      await ownerPool.end();
      await container.stop();
    },
  };
}
