import { randomBytes, randomUUID } from 'node:crypto';
import { parseKeyring, SecretCipher, secretContext } from '@operantix/secrets';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, withTenant } from '../src/database';
import { PostgresConnectionResolver } from '../src/steps/connection-resolver';
import { type EngineDatabase, startEngineDatabase } from './support/engine-database';

describe('PostgresConnectionResolver', () => {
  let database: EngineDatabase;
  const cipher = new SecretCipher(parseKeyring(`test:${randomBytes(32).toString('base64')}`));
  const acme = randomUUID();
  const globex = randomUUID();

  beforeAll(async () => {
    database = await startEngineDatabase();
    for (const id of [acme, globex]) {
      await database.owner.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $2)`, [
        id,
        `org-${id}`,
      ]);
    }
  });

  afterAll(async () => {
    await database.stop();
  });

  const seedSecret = async (organizationId: string, kind: string, value: string) => {
    const id = randomUUID();
    const sealed = cipher.encrypt(value, secretContext(organizationId, id));
    await database.owner.query(
      `INSERT INTO secrets (id, organization_id, kind, key_id, ciphertext) VALUES ($1, $2, $3, $4, $5)`,
      [id, organizationId, kind, sealed.keyId, sealed.ciphertext],
    );
    return id;
  };

  const seedConnection = async (
    organizationId: string,
    auth: { type: 'bearer'; token: string } | { type: 'header'; headerName: string; value: string },
  ) => {
    const secretId = await seedSecret(
      organizationId,
      'CONNECTION_CREDENTIAL',
      auth.type === 'bearer' ? auth.token : auth.value,
    );
    const { rows } = await database.owner.query<{ id: string }>(
      `INSERT INTO connections (organization_id, name, base_url, auth_type, header_name, credential_secret_id)
       VALUES ($1, $2, 'https://api.example.test/v2', $3, $4, $5) RETURNING id`,
      [
        organizationId,
        `c-${randomUUID().slice(0, 8)}`,
        auth.type,
        auth.type === 'header' ? auth.headerName : null,
        secretId,
      ],
    );
    return rows[0]?.id ?? '';
  };

  const resolver = () => new PostgresConnectionResolver(createDatabase(database.worker), cipher);

  it('opens a bearer credential as an Authorization header', async () => {
    const id = await seedConnection(acme, { type: 'bearer', token: 'tok-1' });

    await expect(resolver().resolve(acme, id)).resolves.toEqual({
      baseUrl: 'https://api.example.test/v2',
      header: { name: 'authorization', value: 'Bearer tok-1' },
    });
  });

  it('opens a custom header credential', async () => {
    const id = await seedConnection(acme, {
      type: 'header',
      headerName: 'x-api-key',
      value: 'key-1',
    });

    await expect(resolver().resolve(acme, id)).resolves.toMatchObject({
      header: { name: 'x-api-key', value: 'key-1' },
    });
  });

  it("does not resolve another organization's connection", async () => {
    const id = await seedConnection(globex, { type: 'bearer', token: 'theirs' });

    await expect(resolver().resolve(acme, id)).resolves.toBeUndefined();
  });

  it('cannot read secrets other than connection credentials', async () => {
    await seedSecret(acme, 'WEBHOOK_SIGNING', 'whsec_x');
    const db = createDatabase(database.worker);

    const { rows } = await withTenant(db, acme, (tx) =>
      tx.execute<{ kind: string }>(sql`SELECT kind FROM secrets`),
    );

    expect(rows.map((r) => r.kind)).not.toContain('WEBHOOK_SIGNING');
  });
});
