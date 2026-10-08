import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { endPool } from './support/end-pool';
import { startTenancyDatabase, type TenancyDatabase } from './support/tenancy-database';

/**
 * The workflow worker's database role (ADR-0018): it claims queued jobs of every tenant, but
 * reads executions only inside a tenant scope and cannot touch tables it does not need.
 */
describe('worker database role', () => {
  let database: TenancyDatabase;
  let worker: Pool;
  const acme = randomUUID();
  const globex = randomUUID();
  const executionOf: Record<string, string> = {};

  beforeAll(async () => {
    database = await startTenancyDatabase();
    const owner = database.ownerPool;
    const password = randomUUID();
    await owner.query(`ALTER ROLE operantix_worker LOGIN PASSWORD '${password}'`);
    worker = new Pool({
      host: database.app.host,
      port: database.app.port,
      database: database.app.name,
      user: 'operantix_worker',
      password,
    });

    const user = randomUUID();
    await owner.query(`INSERT INTO users (id, auth_subject) VALUES ($1, 'auth|seed')`, [user]);
    for (const [org, slug] of [
      [acme, 'acme'],
      [globex, 'globex'],
    ] as const) {
      const workspace = randomUUID();
      const workflow = randomUUID();
      await owner.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $2)`, [
        org,
        slug,
      ]);
      await owner.query(
        `INSERT INTO workspaces (id, organization_id, name, slug) VALUES ($1, $2, 'Prod', 'prod')`,
        [workspace, org],
      );
      await owner.query(
        `INSERT INTO workflows (id, organization_id, workspace_id, key, name) VALUES ($1, $2, $3, 'flow', 'Flow')`,
        [workflow, org, workspace],
      );
      await owner.query(
        `INSERT INTO workflow_versions (organization_id, workflow_id, version, definition, created_by)
         VALUES ($1, $2, 1, '{}', $3)`,
        [org, workflow, user],
      );
      const {
        rows: [execution],
      } = await owner.query<{ id: string }>(
        `INSERT INTO executions (organization_id, workflow_id, workflow_version, trigger_type)
         VALUES ($1, $2, 1, 'manual') RETURNING id`,
        [org, workflow],
      );
      if (!execution) throw new Error('seed failed');
      executionOf[org] = execution.id;
      await owner.query(
        'INSERT INTO execution_jobs (organization_id, execution_id) VALUES ($1, $2)',
        [org, execution.id],
      );
    }
  });

  afterAll(async () => {
    await endPool(worker);
    await database.stop();
  });

  const inTenant = async (organizationId: string, sql: string): Promise<unknown[]> => {
    const client = await worker.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [organizationId]);
      const { rows } = await client.query<Record<string, unknown>>(sql);
      await client.query('COMMIT');
      return rows;
    } finally {
      client.release();
    }
  };

  it('sees the queued jobs of every tenant without a tenant scope', async () => {
    const { rows } = await worker.query<{ organization_id: string }>(
      'SELECT organization_id FROM execution_jobs ORDER BY organization_id',
    );

    expect(rows.map((r) => r.organization_id).sort()).toEqual([acme, globex].sort());
  });

  it('can lease a job', async () => {
    const { rowCount } = await worker.query(
      `UPDATE execution_jobs SET locked_until = now() + interval '30 seconds', locked_by = 'w1',
         attempts = attempts + 1 WHERE execution_id = $1`,
      [executionOf[acme]],
    );

    expect(rowCount).toBe(1);
  });

  it('reads executions only inside a tenant scope', async () => {
    const unscoped = await worker.query('SELECT id FROM executions');
    const scoped = await inTenant(acme, 'SELECT id FROM executions');

    expect(unscoped.rows).toEqual([]);
    expect(scoped).toEqual([{ id: executionOf[acme] }]);
  });

  it('cannot read tables outside the execution engine', async () => {
    for (const table of ['workflows', 'memberships', 'users', 'audit_entries']) {
      await expect(worker.query(`SELECT 1 FROM ${table}`), table).rejects.toMatchObject({
        code: '42501',
      });
    }
  });

  it('records execution events inside a tenant scope, but cannot read them back', async () => {
    const client = await worker.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.organization_id', $1, true)`, [acme]);
      await client.query(
        `INSERT INTO execution_events (organization_id, execution_id, type) VALUES ($1, $2, 'execution.started')`,
        [acme, executionOf[acme]],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await expect(worker.query('SELECT 1 FROM execution_events')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('cannot create executions or jobs', async () => {
    await expect(
      worker.query('INSERT INTO execution_jobs (organization_id, execution_id) VALUES ($1, $2)', [
        acme,
        executionOf[acme],
      ]),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
