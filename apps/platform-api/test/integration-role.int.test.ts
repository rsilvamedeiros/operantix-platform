import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { endPool } from './support/end-pool';
import { startTenancyDatabase, type TenancyDatabase } from './support/tenancy-database';

/**
 * The integration worker's database role: it fans events out to webhook deliveries inside the
 * event's tenant, claims deliveries of every tenant from the queue, and reads only what
 * delivering needs.
 */
describe('integration worker database role', () => {
  let database: TenancyDatabase;
  let integration: Pool;
  const acme = randomUUID();
  const globex = randomUUID();
  const endpoints: Record<string, string> = {};

  beforeAll(async () => {
    database = await startTenancyDatabase();
    const owner = database.ownerPool;
    const password = randomUUID();
    await owner.query(`ALTER ROLE operantix_integration LOGIN PASSWORD '${password}'`);
    integration = new Pool({
      host: database.app.host,
      port: database.app.port,
      database: database.app.name,
      user: 'operantix_integration',
      password,
    });
    for (const org of [acme, globex]) {
      await owner.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $1, $1)`, [org]);
      const secretId = randomUUID();
      await owner.query(
        `INSERT INTO secrets (id, organization_id, kind, key_id, ciphertext)
         VALUES ($1, $2, 'WEBHOOK_SIGNING', 'k1', '\\x00')`,
        [secretId, org],
      );
      const { rows } = await owner.query<{ id: string }>(
        `INSERT INTO webhook_endpoints (organization_id, url, event_types, signing_secret_id)
         VALUES ($1, 'https://hooks.example.test/', '{execution.completed}', $2) RETURNING id`,
        [org, secretId],
      );
      endpoints[org] = rows[0]?.id ?? '';
    }
  });

  afterAll(async () => {
    await endPool(integration);
    await database.stop();
  });

  /** Runs `fn` in a transaction scoped to `organizationId`, as the worker's withTenant does. */
  const inTenant = async <T>(organizationId: string, fn: (c: PoolClient) => Promise<T>) => {
    const client = await integration.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  const insertDelivery = (client: PoolClient, org: string) =>
    client.query<{ id: string }>(
      `INSERT INTO webhook_deliveries (organization_id, endpoint_id, event_id, event_type, payload)
       VALUES ($1, $2, $3, 'execution.completed', '{}') RETURNING id`,
      [org, endpoints[org], randomUUID()],
    );

  it("reads a tenant's endpoints and sealed secrets only inside that tenant", async () => {
    const seen = await inTenant(acme, async (c) => {
      const e = await c.query('SELECT id, url, event_types, status FROM webhook_endpoints');
      const s = await c.query('SELECT id, key_id, ciphertext FROM secrets');
      return { endpoints: e.rowCount, secrets: s.rowCount };
    });
    const unscoped = await integration.query('SELECT id FROM webhook_endpoints');

    expect(seen).toEqual({ endpoints: 1, secrets: 1 });
    expect(unscoped.rowCount).toBe(0);
  });

  it('creates deliveries inside the tenant, and claims those of every tenant', async () => {
    await inTenant(acme, (c) => insertDelivery(c, acme));
    await inTenant(globex, (c) => insertDelivery(c, globex));

    const { rows } = await integration.query<{ organization_id: string }>(
      `UPDATE webhook_deliveries SET lease_expires_at = now() + interval '1 minute', attempts = attempts + 1
       WHERE status = 'PENDING' RETURNING organization_id`,
    );

    expect(rows.map((r) => r.organization_id).sort()).toEqual([acme, globex].sort());
  });

  it('cannot create a delivery for another tenant', async () => {
    await expect(inTenant(acme, (c) => insertDelivery(c, globex))).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('appends attempts but cannot rewrite them', async () => {
    const attemptId = await inTenant(acme, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM webhook_deliveries WHERE organization_id = $1`,
        [acme],
      );
      const inserted = await c.query<{ id: string }>(
        `INSERT INTO webhook_delivery_attempts (organization_id, delivery_id, attempt, status_code, duration_ms)
         VALUES ($1, $2, 1, 503, 12) RETURNING id`,
        [acme, rows[0]?.id],
      );
      return inserted.rows[0]?.id;
    });

    await expect(
      inTenant(acme, (c) =>
        c.query('UPDATE webhook_delivery_attempts SET status_code = 200 WHERE id = $1', [
          attemptId,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      inTenant(acme, (c) => c.query('DELETE FROM webhook_delivery_attempts')),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it("tracks an endpoint's health but cannot change where it points", async () => {
    await inTenant(acme, (c) =>
      c.query(
        `UPDATE webhook_endpoints SET consecutive_failures = consecutive_failures + 1, status = 'DISABLED'`,
      ),
    );

    await expect(
      inTenant(acme, (c) => c.query(`UPDATE webhook_endpoints SET url = 'https://evil.test/'`)),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('cannot write secrets or read anything else', async () => {
    await expect(
      inTenant(acme, (c) => c.query(`UPDATE secrets SET key_id = 'k2'`)),
    ).rejects.toMatchObject({ code: '42501' });
    for (const table of ['workflows', 'executions', 'audit_entries', 'memberships']) {
      await expect(integration.query(`SELECT 1 FROM ${table}`)).rejects.toMatchObject({
        code: '42501',
      });
    }
  });
});
