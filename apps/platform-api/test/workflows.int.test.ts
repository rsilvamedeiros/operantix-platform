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

const definition = (message = 'hello') => ({
  schemaVersion: 1,
  trigger: { type: 'manual' },
  steps: [{ id: 'note', name: 'Note', type: 'log', config: { message } }],
});

interface WorkflowBody {
  id: string;
  latestVersion: number;
}

describe('workflows API', () => {
  let database: TenancyDatabase;
  let issuer: JwksIssuer;
  let app: INestApplication;
  const acme = randomUUID();
  const globex = randomUUID();
  const acmeProduction = randomUUID();
  const globexProduction = randomUUID();
  const developer = { id: randomUUID(), sub: 'auth|dev' };
  const viewer = { id: randomUUID(), sub: 'auth|viewer' };
  const operator = { id: randomUUID(), sub: 'auth|operator' };
  const outsider = { id: randomUUID(), sub: 'auth|outsider' };

  beforeAll(async () => {
    [database, issuer] = await Promise.all([startTenancyDatabase(), startJwksIssuer()]);

    const owner = createDatabase(database.ownerPool);
    await owner.insert(organizations).values([
      { id: acme, name: 'Acme', slug: 'acme' },
      { id: globex, name: 'Globex', slug: 'globex' },
    ]);
    await owner.insert(workspaces).values([
      { id: acmeProduction, organizationId: acme, name: 'Production', slug: 'production' },
      { id: globexProduction, organizationId: globex, name: 'Production', slug: 'production' },
    ]);
    await owner
      .insert(users)
      .values(
        [developer, viewer, operator, outsider].map((u) => ({ id: u.id, authSubject: u.sub })),
      );
    await owner.insert(memberships).values([
      { organizationId: acme, userId: developer.id, role: 'DEVELOPER' },
      { organizationId: acme, userId: viewer.id, role: 'VIEWER' },
      { organizationId: acme, userId: operator.id, role: 'OPERATOR' },
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
  const workflowsOf = (org: string, workspace: string) =>
    `/v1/organizations/${org}/workspaces/${workspace}/workflows`;

  const createWorkflow = async (
    sub: string,
    key: string,
    workspace: string = acmeProduction,
    org: string = acme,
  ) =>
    request(httpServer(app))
      .post(workflowsOf(org, workspace))
      .set('Authorization', await as(sub))
      .send({ name: `Workflow ${key}`, key, definition: definition() });

  it('creates a workflow with its first version and audits it', async () => {
    const res = await createWorkflow(developer.sub, 'restart-service');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String) as unknown,
      workspaceId: acmeProduction,
      name: 'Workflow restart-service',
      key: 'restart-service',
      latestVersion: 1,
      activeVersion: null,
      createdAt: expect.any(String) as unknown,
    });
    const { rows } = await database.ownerPool.query(
      'SELECT action, actor_user_id FROM audit_entries WHERE resource_id = $1',
      [(res.body as WorkflowBody).id],
    );
    expect(rows).toEqual([{ action: 'workflow.created', actor_user_id: developer.id }]);
  });

  it('lists the workflows of a workspace', async () => {
    const res = await request(httpServer(app))
      .get(workflowsOf(acme, acmeProduction))
      .set('Authorization', await as(viewer.sub));

    expect(res.status).toBe(200);
    expect((res.body as { data: { key: string }[] }).data.map((w) => w.key)).toEqual([
      'restart-service',
    ]);
  });

  it('forbids a viewer from creating workflows', async () => {
    const res = await createWorkflow(viewer.sub, 'not-allowed');

    expect(res.status).toBe(403);
  });

  it('answers 409 when the key is taken in the workspace', async () => {
    const res = await createWorkflow(developer.sub, 'restart-service');

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'WORKFLOW_KEY_TAKEN' });
  });

  it('answers 404 for a workspace of another organization', async () => {
    const res = await createWorkflow(developer.sub, 'sneaky', globexProduction);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });

  it('answers 404 for a malformed workspace id', async () => {
    const res = await createWorkflow(developer.sub, 'sneaky', 'not-a-uuid');

    expect(res.status).toBe(404);
  });

  it('rejects an invalid definition, naming the offending paths', async () => {
    const res = await request(httpServer(app))
      .post(workflowsOf(acme, acmeProduction))
      .set('Authorization', await as(developer.sub))
      .send({ name: 'Broken', key: 'broken', definition: { schemaVersion: 1, steps: [] } });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: {
        fields: expect.arrayContaining(['definition.trigger', 'definition.steps']) as unknown,
      },
    });
  });

  it('adds versions with increasing numbers and returns each one', async () => {
    const created = await createWorkflow(developer.sub, 'versioned');
    const { id } = created.body as WorkflowBody;
    const auth = await as(developer.sub);

    const v2 = await request(httpServer(app))
      .post(`/v1/organizations/${acme}/workflows/${id}/versions`)
      .set('Authorization', auth)
      .send({ definition: definition('second') });
    const v3 = await request(httpServer(app))
      .post(`/v1/organizations/${acme}/workflows/${id}/versions`)
      .set('Authorization', auth)
      .send({ definition: definition('third') });

    expect(v2.status).toBe(201);
    expect(v2.body).toMatchObject({ version: 2, createdBy: developer.id });
    expect(v3.body).toMatchObject({ version: 3 });

    const workflow = await request(httpServer(app))
      .get(`/v1/organizations/${acme}/workflows/${id}`)
      .set('Authorization', auth);
    expect(workflow.body).toMatchObject({ latestVersion: 3 });
    expect(
      (workflow.body as { versions: { version: number }[] }).versions.map((v) => v.version),
    ).toEqual([3, 2, 1]);

    const version2 = await request(httpServer(app))
      .get(`/v1/organizations/${acme}/workflows/${id}/versions/2`)
      .set('Authorization', auth);
    expect(version2.status).toBe(200);
    expect(version2.body).toMatchObject({ version: 2, definition: definition('second') });
  });

  it('assigns distinct version numbers to concurrent writers', async () => {
    const created = await createWorkflow(developer.sub, 'concurrent');
    const { id } = created.body as WorkflowBody;
    const auth = await as(developer.sub);

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request(httpServer(app))
          .post(`/v1/organizations/${acme}/workflows/${id}/versions`)
          .set('Authorization', auth)
          .send({ definition: definition(`v${String(i)}`) }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(results.map((r) => (r.body as { version: number }).version).sort()).toEqual([
      2, 3, 4, 5, 6,
    ]);
  });

  it('answers 404 for an unknown version', async () => {
    const created = await createWorkflow(developer.sub, 'one-version');
    const { id } = created.body as WorkflowBody;

    const res = await request(httpServer(app))
      .get(`/v1/organizations/${acme}/workflows/${id}/versions/9`)
      .set('Authorization', await as(developer.sub));

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'WORKFLOW_VERSION_NOT_FOUND' });
  });

  it('does not reveal a workflow to another organization, even with its id', async () => {
    const created = await createWorkflow(developer.sub, 'private');
    const { id } = created.body as WorkflowBody;

    const read = await request(httpServer(app))
      .get(`/v1/organizations/${globex}/workflows/${id}`)
      .set('Authorization', await as(outsider.sub));
    const write = await request(httpServer(app))
      .post(`/v1/organizations/${globex}/workflows/${id}/versions`)
      .set('Authorization', await as(outsider.sub))
      .send({ definition: definition('hijack') });

    expect(read.status).toBe(404);
    expect(write.status).toBe(404);
    expect(write.body).toMatchObject({ code: 'WORKFLOW_NOT_FOUND' });
  });

  describe('activation', () => {
    const activationOf = (id: string, org: string = acme) =>
      `/v1/organizations/${org}/workflows/${id}/activation`;

    const workflowWithTwoVersions = async (key: string): Promise<string> => {
      const created = await createWorkflow(developer.sub, key);
      const { id } = created.body as WorkflowBody;
      await request(httpServer(app))
        .post(`/v1/organizations/${acme}/workflows/${id}/versions`)
        .set('Authorization', await as(developer.sub))
        .send({ definition: definition('second') });
      return id;
    };

    it('activates a version, switches to another and deactivates, auditing each change', async () => {
      const id = await workflowWithTwoVersions('to-activate');
      const auth = await as(operator.sub);

      const first = await request(httpServer(app))
        .put(activationOf(id))
        .set('Authorization', auth)
        .send({ version: 1 });
      const second = await request(httpServer(app))
        .put(activationOf(id))
        .set('Authorization', auth)
        .send({ version: 2 });
      const off = await request(httpServer(app))
        .delete(activationOf(id))
        .set('Authorization', auth);

      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ id, activeVersion: 1 });
      expect(second.body).toMatchObject({ activeVersion: 2 });
      expect(off.status).toBe(200);
      expect(off.body).toMatchObject({ activeVersion: null });

      const { rows } = await database.ownerPool.query(
        `SELECT action, metadata FROM audit_entries
         WHERE resource_id = $1 AND action LIKE 'workflow.%activated' ORDER BY occurred_at`,
        [id],
      );
      expect(rows).toEqual([
        { action: 'workflow.activated', metadata: { version: 1, previousVersion: null } },
        { action: 'workflow.activated', metadata: { version: 2, previousVersion: 1 } },
        { action: 'workflow.deactivated', metadata: { previousVersion: 2 } },
      ]);
    });

    it('treats deactivating an inactive workflow as a no-op without an audit entry', async () => {
      const id = await workflowWithTwoVersions('never-active');

      const res = await request(httpServer(app))
        .delete(activationOf(id))
        .set('Authorization', await as(operator.sub));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ activeVersion: null });
      const { rows } = await database.ownerPool.query(
        "SELECT 1 FROM audit_entries WHERE resource_id = $1 AND action = 'workflow.deactivated'",
        [id],
      );
      expect(rows).toEqual([]);
    });

    it('answers 404 when activating a version that does not exist', async () => {
      const id = await workflowWithTwoVersions('missing-version');

      const res = await request(httpServer(app))
        .put(activationOf(id))
        .set('Authorization', await as(operator.sub))
        .send({ version: 7 });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'WORKFLOW_VERSION_NOT_FOUND' });
    });

    it('rejects an invalid activation body', async () => {
      const id = await workflowWithTwoVersions('bad-body');

      const res = await request(httpServer(app))
        .put(activationOf(id))
        .set('Authorization', await as(operator.sub))
        .send({ version: 'latest' });

      expect(res.status).toBe(400);
    });

    it('forbids a viewer from activating', async () => {
      const id = await workflowWithTwoVersions('viewer-activation');

      const res = await request(httpServer(app))
        .put(activationOf(id))
        .set('Authorization', await as(viewer.sub))
        .send({ version: 1 });

      expect(res.status).toBe(403);
    });

    it('does not let another organization activate the workflow', async () => {
      const id = await workflowWithTwoVersions('foreign-activation');

      const res = await request(httpServer(app))
        .put(activationOf(id, globex))
        .set('Authorization', await as(outsider.sub))
        .send({ version: 1 });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'WORKFLOW_NOT_FOUND' });
    });

    it('refuses at the database level to point at a version that does not exist', async () => {
      const id = await workflowWithTwoVersions('db-guard');

      await expect(
        database.ownerPool.query('UPDATE workflows SET active_version = 99 WHERE id = $1', [id]),
      ).rejects.toThrow(/foreign key/);
    });
  });

  it('keeps published versions immutable', async () => {
    await expect(
      database.ownerPool.query("UPDATE workflow_versions SET definition = '{}'::jsonb"),
    ).rejects.toThrow(/immutable/);
  });
});
