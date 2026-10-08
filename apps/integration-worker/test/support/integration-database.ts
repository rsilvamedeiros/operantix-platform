import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { type Keyring, parseKeyring, SecretCipher, secretContext } from '@operantix/secrets';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// platform-api owns the schema; the worker is tested against its real migrations.
const MIGRATIONS = resolve(__dirname, '../../../platform-api/migrations');

export interface EndpointOptions {
  url: string;
  eventTypes?: string[];
  status?: 'ACTIVE' | 'DISABLED';
  consecutiveFailures?: number;
}

export interface IntegrationDatabase {
  /** Schema owner (superuser in the container): bypasses RLS, for seeding and assertions. */
  owner: Pool;
  /** Pool of the integration worker role, which RLS and its grants apply to. */
  integration: Pool;
  connection: { host: string; port: number; name: string; user: string; password: string };
  keyring: Keyring;
  seedOrganization(): Promise<string>;
  /** An endpoint with a freshly sealed signing secret; returns its id and the secret. */
  seedEndpoint(
    organizationId: string,
    options: EndpointOptions,
  ): Promise<{ id: string; secret: string }>;
  stop(): Promise<void>;
}

export async function startIntegrationDatabase(): Promise<IntegrationDatabase> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const owner = new Pool({ connectionString: container.getConnectionUri() });
  await migrate(drizzle({ client: owner }), { migrationsFolder: MIGRATIONS });
  const password = randomUUID();
  await owner.query(`ALTER ROLE operantix_integration LOGIN PASSWORD '${password}'`);
  const connection = {
    host: container.getHost(),
    port: container.getPort(),
    name: container.getDatabase(),
    user: 'operantix_integration',
    password,
  };
  const integration = new Pool({ ...connection, database: connection.name });
  const keyring = parseKeyring(`test:${randomBytes(32).toString('base64')}`);
  const cipher = new SecretCipher(keyring);

  return {
    owner,
    integration,
    connection,
    keyring,
    seedOrganization: async () => {
      const id = randomUUID();
      await owner.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $1, $1)`, [id]);
      return id;
    },
    seedEndpoint: async (organizationId, options) => {
      const secret = `whsec_${randomBytes(32).toString('base64url')}`;
      const secretId = randomUUID();
      const sealed = cipher.encrypt(secret, secretContext(organizationId, secretId));
      await owner.query(
        `INSERT INTO secrets (id, organization_id, kind, key_id, ciphertext)
         VALUES ($1, $2, 'WEBHOOK_SIGNING', $3, $4)`,
        [secretId, organizationId, sealed.keyId, sealed.ciphertext],
      );
      const { rows } = await owner.query<{ id: string }>(
        `INSERT INTO webhook_endpoints
           (organization_id, url, event_types, status, consecutive_failures, signing_secret_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          organizationId,
          options.url,
          options.eventTypes ?? ['execution.completed'],
          options.status ?? 'ACTIVE',
          options.consecutiveFailures ?? 0,
          secretId,
        ],
      );
      return { id: rows[0]?.id ?? '', secret };
    },
    stop: async () => {
      await integration.end();
      await owner.end();
      await container.stop();
    },
  };
}
