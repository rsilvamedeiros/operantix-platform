import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config/config';
import { createDatabase } from '../src/database/database';
import { memberships, users } from '../src/identity/identity.schema';
import { organizations, workspaces } from '../src/organizations/organizations.schema';
import { AUDIENCE, ISSUER, type JwksIssuer, startJwksIssuer } from './support/jwks-issuer';
import { startTenancyDatabase, type TenancyDatabase } from './support/tenancy-database';

const httpServer = (app: INestApplication): Server => app.getHttpServer() as Server;
// Redis is not needed to exercise the API.
const CLOSED_PORT = 1;

const definition = {
  schemaVersion: 1,
  trigger: { type: 'manual' },
  steps: [
    { id: 'wait', name: 'Wait', type: 'delay', config: { seconds: 1 } },
    { id: 'note', name: 'Note', type: 'log', config: { message: 'done' } },
  ],
};

interface ExecutionBody {
  id: string;
  status: string;
  workflowVersion: number;
  steps: { stepId: string; position: number; status: string }[];
}

describe('executions API', () => {
  let database: TenancyDatabase;
  let issuer: JwksIssuer;
  let app: INestApplication;
  const acme = randomUUID();
  const globex = randomUUID();
  const production = randomUUID();
  const operator = { id: randomUUID(), sub: 'auth|operator' };
  const viewer = { id: randomUUID(), sub: 'auth|viewer' };
  const outsider = { id: randomUUID(), sub: 'auth|outsider' };

  beforeAll(async () => {
    [database, issuer] = await Promise.all([startTenancyDatabase(), startJwksIssuer()]);
    const owner = createDatabase(database.ownerPool);
    await owner.insert(organizations).values([
      { id: acme, name: 'Acme', slug: 'acme' },
      { id: globex, name: 'Globex', slug: 'globex' },
    ]);
    await owner
      .insert(workspaces)
      .values({ id: production, organizationId: acme, name: 'Production', slug: 'production' });
    await owner
      .insert(users)
      .values([operator, viewer, outsider].map((u) => ({ id: u.id, authSubject: u.sub })));
    await owner.insert(memberships).values([
      { organizationId: acme, userId: operator.id, role: 'OPERATOR' },
      { organizationId: acme, userId: viewer.id, role: 'VIEWER' },
      { organizationId: globex, userId: outsider.id, role: 'OWNER' },
    ]);

    const config: AppConfig = {
      env: 'test',
      port: 0,
      database: database.app,
      redis: { host: '127.0.0.1', port: CLOSED_PORT },
      health: { checkTimeoutMs: 100 },
      auth: { issuer: ISSUER, audience: AUDIENCE, jwksUri: issuer.jwksUri },
    };
    app = await createApp(config, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await issuer.close();
    await database.stop();
  });

  const as = async (sub: string) => `Bearer ${await issuer.token(sub)}`;
  const base = `/api/v1/organizations/${acme}`;

  /** A workflow created by a developer-like owner insert, optionally activated. */
  const workflow = async (key: string, active: boolean): Promise<string> => {
    const id = randomUUID();
    await database.ownerPool.query(
      `INSERT INTO workflows (id, organization_id, workspace_id, key, name) VALUES ($1, $2, $3, $4, $4)`,
      [id, acme, production, key],
    );
    await database.ownerPool.query(
      `INSERT INTO workflow_versions (organization_id, workflow_id, version, definition, created_by)
       VALUES ($1, $2, 1, $3, $4)`,
      [acme, id, JSON.stringify(definition), operator.id],
    );
    if (active) {
      await database.ownerPool.query('UPDATE workflows SET active_version = 1 WHERE id = $1', [id]);
    }
    return id;
  };

  const start = async (workflowId: string, sub: string, body: object = {}, key?: string) => {
    const req = request(httpServer(app))
      .post(`${base}/workflows/${workflowId}/executions`)
      .set('Authorization', await as(sub));
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };

  it('starts a pending execution of the active version with one pending step per definition step', async () => {
    const id = await workflow('manual-run', true);

    const res = await start(id, operator.sub, { input: { ticket: 'INC-1' } });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      workflowId: id,
      workflowVersion: 1,
      status: 'PENDING',
      triggeredBy: operator.id,
      input: { ticket: 'INC-1' },
      steps: [
        { stepId: 'wait', position: 0, status: 'PENDING', attempts: 0 },
        { stepId: 'note', position: 1, status: 'PENDING', attempts: 0 },
      ],
    });
  });

  const jobsOf = async (executionId: string) =>
    (
      await database.ownerPool.query<{ organization_id: string; attempts: number }>(
        'SELECT organization_id, attempts FROM execution_jobs WHERE execution_id = $1',
        [executionId],
      )
    ).rows;

  it('enqueues one job for the worker in the same transaction as the execution', async () => {
    const id = await workflow('queued', true);

    const res = await start(id, operator.sub);

    expect(res.status).toBe(201);
    expect(await jobsOf((res.body as ExecutionBody).id)).toEqual([
      { organization_id: acme, attempts: 0 },
    ]);
  });

  it('does not enqueue again when a request is replayed', async () => {
    const id = await workflow('queued-replay', true);
    const first = await start(id, operator.sub, {}, 'replay-queue');

    const replay = await start(id, operator.sub, {}, 'replay-queue');

    expect(replay.status).toBe(200);
    expect(await jobsOf((first.body as ExecutionBody).id)).toHaveLength(1);
  });

  it('refuses to start an inactive workflow', async () => {
    const id = await workflow('inactive', false);

    const res = await start(id, operator.sub);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'WORKFLOW_INACTIVE' });
  });

  it('forbids a viewer from starting executions', async () => {
    const id = await workflow('viewer-start', true);

    expect((await start(id, viewer.sub)).status).toBe(403);
  });

  it('answers 404 to another organization, even with the workflow id', async () => {
    const id = await workflow('foreign-start', true);

    const res = await request(httpServer(app))
      .post(`/api/v1/organizations/${globex}/workflows/${id}/executions`)
      .set('Authorization', await as(outsider.sub))
      .send({});

    expect(res.status).toBe(404);
  });

  describe('idempotency', () => {
    it('replays the same execution for a repeated key and payload', async () => {
      const id = await workflow('idempotent', true);

      const first = await start(id, operator.sub, { input: { a: 1 } }, 'retry-1');
      const again = await start(id, operator.sub, { input: { a: 1 } }, 'retry-1');

      expect(first.status).toBe(201);
      expect(again.status).toBe(200);
      expect((again.body as ExecutionBody).id).toBe((first.body as ExecutionBody).id);
    });

    it('rejects a repeated key with a different payload', async () => {
      const id = await workflow('key-reuse', true);

      await start(id, operator.sub, { input: { a: 1 } }, 'reused');
      const res = await start(id, operator.sub, { input: { a: 2 } }, 'reused');

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    });

    it('creates one execution when the same key races', async () => {
      const id = await workflow('racing', true);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => start(id, operator.sub, {}, 'race')),
      );

      const ids = new Set(results.map((r) => (r.body as ExecutionBody).id));
      expect(ids.size).toBe(1);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    });

    it('rejects an oversized key', async () => {
      const id = await workflow('long-key', true);

      const res = await start(id, operator.sub, {}, 'k'.repeat(256));

      expect(res.status).toBe(400);
    });
  });

  it('returns an execution with its steps, and 404 for unknown ids', async () => {
    const id = await workflow('readable', true);
    const created = (await start(id, operator.sub)).body as ExecutionBody;

    const found = await request(httpServer(app))
      .get(`${base}/executions/${created.id}`)
      .set('Authorization', await as(viewer.sub));
    const missing = await request(httpServer(app))
      .get(`${base}/executions/${randomUUID()}`)
      .set('Authorization', await as(viewer.sub));

    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({
      id: created.id,
      steps: [{ stepId: 'wait' }, { stepId: 'note' }],
    });
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ code: 'EXECUTION_NOT_FOUND' });
  });

  it('lists executions newest first with a cursor', async () => {
    const id = await workflow('paged', true);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++)
      ids.push(((await start(id, operator.sub)).body as ExecutionBody).id);
    const auth = await as(viewer.sub);

    const page1 = await request(httpServer(app))
      .get(`${base}/workflows/${id}/executions?limit=2`)
      .set('Authorization', auth);
    const { data, nextCursor } = page1.body as { data: { id: string }[]; nextCursor: string };
    const page2 = await request(httpServer(app))
      .get(`${base}/workflows/${id}/executions?limit=2&cursor=${encodeURIComponent(nextCursor)}`)
      .set('Authorization', auth);

    expect(data.map((e) => e.id)).toEqual([ids[2], ids[1]]);
    expect(page2.body).toEqual({
      data: [expect.objectContaining({ id: ids[0] }) as unknown],
      nextCursor: null,
    });
  });

  it('rejects an invalid limit or cursor', async () => {
    const id = await workflow('bad-page', true);
    const auth = await as(viewer.sub);

    const limit = await request(httpServer(app))
      .get(`${base}/workflows/${id}/executions?limit=1000`)
      .set('Authorization', auth);
    const cursor = await request(httpServer(app))
      .get(`${base}/workflows/${id}/executions?cursor=garbage`)
      .set('Authorization', auth);

    expect(limit.status).toBe(400);
    expect(cursor.status).toBe(400);
  });
});
