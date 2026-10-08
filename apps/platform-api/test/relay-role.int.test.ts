import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { endPool } from './support/end-pool';
import { startTenancyDatabase, type TenancyDatabase } from './support/tenancy-database';

/**
 * The outbox relay's database role: it reads and marks the outbox of every tenant, because
 * outbox rows hold only contract events, and it touches nothing else.
 */
describe('outbox relay database role', () => {
  let database: TenancyDatabase;
  let relay: Pool;
  const organizations = [randomUUID(), randomUUID()];

  beforeAll(async () => {
    database = await startTenancyDatabase();
    const owner = database.ownerPool;
    const password = randomUUID();
    await owner.query(`ALTER ROLE operantix_relay LOGIN PASSWORD '${password}'`);
    relay = new Pool({
      host: database.app.host,
      port: database.app.port,
      database: database.app.name,
      user: 'operantix_relay',
      password,
    });
    for (const [i, org] of organizations.entries()) {
      await owner.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $2)`, [
        org,
        `org-${String(i)}`,
      ]);
      await owner.query(
        `INSERT INTO outbox_events (organization_id, event_id, topic, partition_key, event_type, payload)
         VALUES ($1, $2, 'opx.execution.events.v1', 'key', 'execution.started', '{}')`,
        [org, randomUUID()],
      );
    }
  });

  afterAll(async () => {
    await endPool(relay);
    await database.stop();
  });

  it('reads unpublished events of every tenant without a tenant scope', async () => {
    const { rows } = await relay.query<{ organization_id: string }>(
      'SELECT organization_id FROM outbox_events WHERE published_at IS NULL',
    );

    expect(rows.map((r) => r.organization_id).sort()).toEqual([...organizations].sort());
  });

  it('marks events published', async () => {
    const { rowCount } = await relay.query('UPDATE outbox_events SET published_at = now()');

    expect(rowCount).toBe(2);
  });

  it('cannot change an event itself', async () => {
    await expect(
      relay.query(`UPDATE outbox_events SET payload = '{"forged": true}'`),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('cannot write events', async () => {
    await expect(
      relay.query(
        `INSERT INTO outbox_events (organization_id, event_id, topic, partition_key, event_type, payload)
         VALUES ($1, $2, 't', 'k', 'execution.started', '{}')`,
        [organizations[0], randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('deletes events', async () => {
    const { rowCount } = await relay.query('DELETE FROM outbox_events');

    expect(rowCount).toBe(2);
  });

  it('cannot read anything outside the outbox', async () => {
    for (const table of ['executions', 'execution_jobs', 'execution_events', 'organizations']) {
      await expect(relay.query(`SELECT 1 FROM ${table}`), table).rejects.toMatchObject({
        code: '42501',
      });
    }
  });
});
