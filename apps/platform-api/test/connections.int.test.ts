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
import { testKeyring } from './support/secrets';
import { startTenancyDatabase, type TenancyDatabase } from './support/tenancy-database';

const httpServer = (app: INestApplication): Server => app.getHttpServer() as Server;
const CLOSED_PORT = 1;
const TOKEN = 'crm-token-value';

interface ConnectionBody {
  id: string;
  name: string;
}

describe('connections API', () => {
  let database: TenancyDatabase;
  let issuer: JwksIssuer;
  let app: INestApplication;
  const acme = randomUUID();
  const globex = randomUUID();
  const production = randomUUID();
  const developer = { id: randomUUID(), sub: 'auth|dev' };
  const operator = { id: randomUUID(), sub: 'auth|operator' };
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
      .values([developer, operator, outsider].map((u) => ({ id: u.id, authSubject: u.sub })));
    await owner.insert(memberships).values([
      { organizationId: acme, userId: developer.id, role: 'DEVELOPER' },
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
      secrets: { keyring: testKeyring() },
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
  const connectionsOf = (org: string) => `/api/v1/organizations/${org}/connections`;

  const create = async (body: object) =>
    request(httpServer(app))
      .post(connectionsOf(acme))
      .set('Authorization', await as(developer.sub))
      .send(body);

  const credentialOf = async (connectionId: string) => {
    const { rows } = await database.ownerPool.query<{ kind: string; ciphertext: Buffer }>(
      `SELECT s.kind, s.ciphertext FROM connections c JOIN secrets s ON s.id = c.credential_secret_id
        WHERE c.id = $1`,
      [connectionId],
    );
    return rows[0];
  };

  it('creates a bearer connection and never returns or stores the token in clear', async () => {
    const res = await create({
      name: 'crm',
      baseUrl: 'https://api.crm.example.test/v2',
      auth: { type: 'bearer', token: TOKEN },
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String) as unknown,
      name: 'crm',
      baseUrl: 'https://api.crm.example.test/v2',
      authType: 'bearer',
      headerName: null,
      createdAt: expect.any(String) as unknown,
      updatedAt: expect.any(String) as unknown,
    });
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    const credential = await credentialOf((res.body as ConnectionBody).id);
    expect(credential?.kind).toBe('CONNECTION_CREDENTIAL');
    expect(credential?.ciphertext.toString('latin1')).not.toContain(TOKEN);
  });

  it('creates a custom header connection', async () => {
    const res = await create({
      name: 'billing',
      baseUrl: 'https://billing.example.test',
      auth: { type: 'header', headerName: 'X-Api-Key', value: 'k-1' },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ authType: 'header', headerName: 'x-api-key' });
  });

  it.each([
    ['a base URL with a query', { baseUrl: 'https://a.example.test/?x=1' }],
    ['a base URL with credentials', { baseUrl: 'https://u:p@a.example.test' }],
    ['a non-http base URL', { baseUrl: 'ftp://a.example.test' }],
    ['an empty token', { auth: { type: 'bearer', token: '' } }],
    ['a reserved header', { auth: { type: 'header', headerName: 'Host', value: 'x' } }],
    ['an invalid header name', { auth: { type: 'header', headerName: 'X Key', value: 'x' } }],
    ['an unknown auth type', { auth: { type: 'oauth2' } }],
    ['an invalid name', { name: 'Has Spaces' }],
  ])('rejects %s', async (_, patch) => {
    const res = await create({
      name: `c-${randomUUID().slice(0, 8)}`,
      baseUrl: 'https://a.example.test',
      auth: { type: 'bearer', token: 't' },
      ...patch,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('keeps names unique within the organization', async () => {
    const body = {
      name: 'dup',
      baseUrl: 'https://a.example.test',
      auth: { type: 'bearer', token: 't' },
    };
    await create(body);

    const again = await create(body);
    const otherTenant = await request(httpServer(app))
      .post(connectionsOf(globex))
      .set('Authorization', await as(outsider.sub))
      .send(body);

    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'CONNECTION_NAME_TAKEN' });
    expect(otherTenant.status).toBe(201);
  });

  it('replaces the credential and audits without the value', async () => {
    const created = await create({
      name: 'rotating',
      baseUrl: 'https://a.example.test',
      auth: { type: 'bearer', token: 'old-token' },
    });
    const id = (created.body as ConnectionBody).id;
    const before = await credentialOf(id);

    const res = await request(httpServer(app))
      .put(`${connectionsOf(acme)}/${id}/credential`)
      .set('Authorization', await as(developer.sub))
      .send({ auth: { type: 'header', headerName: 'X-Token', value: 'new-token' } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, authType: 'header', headerName: 'x-token' });
    const after = await credentialOf(id);
    expect(after?.ciphertext.equals(before?.ciphertext ?? Buffer.alloc(0))).toBe(false);
    const { rows: secretsLeft } = await database.ownerPool.query<{ count: string }>(
      `SELECT count(*) FROM secrets WHERE organization_id = $1 AND kind = 'CONNECTION_CREDENTIAL'
         AND id NOT IN (SELECT credential_secret_id FROM connections)`,
      [acme],
    );
    expect(secretsLeft[0]?.count).toBe('0');
    const { rows: audit } = await database.ownerPool.query<{ action: string; metadata: unknown }>(
      'SELECT action, metadata FROM audit_entries WHERE resource_id = $1 ORDER BY occurred_at',
      [id],
    );
    expect(audit.map((a) => a.action)).toEqual([
      'connection.created',
      'connection.credential_replaced',
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/old-token|new-token/);
  });

  it('lists, reads and deletes connections', async () => {
    const created = await create({
      name: 'short-lived',
      baseUrl: 'https://a.example.test',
      auth: { type: 'bearer', token: 't' },
    });
    const id = (created.body as ConnectionBody).id;
    const auth = await as(developer.sub);

    const listed = await request(httpServer(app))
      .get(connectionsOf(acme))
      .set('Authorization', auth);
    const read = await request(httpServer(app))
      .get(`${connectionsOf(acme)}/${id}`)
      .set('Authorization', auth);
    const deleted = await request(httpServer(app))
      .delete(`${connectionsOf(acme)}/${id}`)
      .set('Authorization', auth);
    const gone = await request(httpServer(app))
      .get(`${connectionsOf(acme)}/${id}`)
      .set('Authorization', auth);

    expect((listed.body as { data: ConnectionBody[] }).data.map((c) => c.id)).toContain(id);
    expect(read.status).toBe(200);
    expect(deleted.status).toBe(204);
    expect(gone.status).toBe(404);
    expect(gone.body).toMatchObject({ code: 'CONNECTION_NOT_FOUND' });
  });

  it('lets operators read connections but not manage them, and hides other tenants', async () => {
    const created = await create({
      name: 'guarded',
      baseUrl: 'https://a.example.test',
      auth: { type: 'bearer', token: 't' },
    });
    const id = (created.body as ConnectionBody).id;

    const read = await request(httpServer(app))
      .get(`${connectionsOf(acme)}/${id}`)
      .set('Authorization', await as(operator.sub));
    const write = await request(httpServer(app))
      .delete(`${connectionsOf(acme)}/${id}`)
      .set('Authorization', await as(operator.sub));
    const foreign = await request(httpServer(app))
      .get(`${connectionsOf(globex)}/${id}`)
      .set('Authorization', await as(outsider.sub));

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
    expect(foreign.status).toBe(404);
  });

  describe('used by HTTP steps', () => {
    const definitionUsing = (connectionId: string, url: string) => ({
      schemaVersion: 1,
      trigger: { type: 'manual' },
      steps: [
        {
          id: 'call',
          name: 'Call CRM',
          type: 'http_request',
          config: { method: 'GET', url, connectionId },
        },
      ],
    });

    const crm = async (): Promise<string> => {
      const res = await create({
        name: `crm-${randomUUID().slice(0, 8)}`,
        baseUrl: 'https://api.crm.example.test/v2',
        auth: { type: 'bearer', token: 't' },
      });
      return (res.body as ConnectionBody).id;
    };

    const publish = async (definition: object) =>
      request(httpServer(app))
        .post(`/api/v1/organizations/${acme}/workspaces/${production}/workflows`)
        .set('Authorization', await as(developer.sub))
        .send({ name: 'Sync', key: `sync-${randomUUID().slice(0, 8)}`, definition });

    it('accepts a step inside the base URL of a connection of the organization', async () => {
      const res = await publish(
        definitionUsing(await crm(), 'https://api.crm.example.test/v2/leads'),
      );

      expect(res.status).toBe(201);
    });

    it('rejects an unknown connection or a URL outside its base URL', async () => {
      const unknown = await publish(
        definitionUsing(randomUUID(), 'https://api.crm.example.test/v2/leads'),
      );
      const outside = await publish(definitionUsing(await crm(), 'https://evil.example.test/v2'));

      for (const res of [unknown, outside]) {
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({
          code: 'VALIDATION_FAILED',
          details: { fields: ['definition.steps.0.config.connectionId'] },
        });
      }
    });

    it("rejects another organization's connection", async () => {
      const foreign = await request(httpServer(app))
        .post(connectionsOf(globex))
        .set('Authorization', await as(outsider.sub))
        .send({
          name: 'foreign',
          baseUrl: 'https://api.crm.example.test/v2',
          auth: { type: 'bearer', token: 't' },
        });

      const res = await publish(
        definitionUsing((foreign.body as ConnectionBody).id, 'https://api.crm.example.test/v2/x'),
      );

      expect(res.status).toBe(400);
    });

    it('refuses to delete a connection an active version uses', async () => {
      const connectionId = await crm();
      const created = await publish(
        definitionUsing(connectionId, 'https://api.crm.example.test/v2/leads'),
      );
      const workflowId = (created.body as { id: string }).id;
      const auth = await as(developer.sub);
      await request(httpServer(app))
        .put(`/api/v1/organizations/${acme}/workflows/${workflowId}/activation`)
        .set('Authorization', auth)
        .send({ version: 1 });

      const inUse = await request(httpServer(app))
        .delete(`${connectionsOf(acme)}/${connectionId}`)
        .set('Authorization', auth);
      await request(httpServer(app))
        .delete(`/api/v1/organizations/${acme}/workflows/${workflowId}/activation`)
        .set('Authorization', auth);
      const unused = await request(httpServer(app))
        .delete(`${connectionsOf(acme)}/${connectionId}`)
        .set('Authorization', auth);

      expect(inUse.status).toBe(409);
      expect(inUse.body).toMatchObject({ code: 'CONNECTION_IN_USE' });
      expect(unused.status).toBe(204);
    });
  });
});
