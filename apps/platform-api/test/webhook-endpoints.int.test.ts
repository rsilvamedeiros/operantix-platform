import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { SecretCipher } from '@operantix/secrets';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config/config';
import { createDatabase } from '../src/database/database';
import { memberships, users } from '../src/identity/identity.schema';
import { organizations } from '../src/organizations/organizations.schema';
import { AUDIENCE, ISSUER, type JwksIssuer, startJwksIssuer } from './support/jwks-issuer';
import { testKeyring } from './support/secrets';
import { startTenancyDatabase, type TenancyDatabase } from './support/tenancy-database';

const httpServer = (app: INestApplication): Server => app.getHttpServer() as Server;
const CLOSED_PORT = 1;

interface EndpointBody {
  id: string;
  url: string;
  eventTypes: string[];
  status: string;
  signingSecret?: string;
}

describe('webhook endpoints API', () => {
  let database: TenancyDatabase;
  let issuer: JwksIssuer;
  let app: INestApplication;
  const keyring = testKeyring();
  const acme = randomUUID();
  const globex = randomUUID();
  const developer = { id: randomUUID(), sub: 'auth|dev' };
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
      .insert(users)
      .values(
        [developer, operator, viewer, outsider].map((u) => ({ id: u.id, authSubject: u.sub })),
      );
    await owner.insert(memberships).values([
      { organizationId: acme, userId: developer.id, role: 'DEVELOPER' },
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
      secrets: { keyring },
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
  const endpointsOf = (org: string) => `/api/v1/organizations/${org}/webhook-endpoints`;

  const create = async (
    sub: string,
    body: object = {
      url: 'https://hooks.example.test/operantix',
      eventTypes: ['execution.completed', 'execution.failed'],
      description: 'Ops channel',
    },
    org: string = acme,
  ) =>
    request(httpServer(app))
      .post(endpointsOf(org))
      .set('Authorization', await as(sub))
      .send(body);

  const storedSecret = async (endpointId: string) => {
    const { rows } = await database.ownerPool.query<{
      id: string;
      organization_id: string;
      key_id: string;
      ciphertext: Buffer;
    }>(
      `SELECT s.id, s.organization_id, s.key_id, s.ciphertext
         FROM webhook_endpoints e JOIN secrets s ON s.id = e.signing_secret_id
        WHERE e.id = $1`,
      [endpointId],
    );
    return rows[0];
  };

  it('creates an endpoint and shows its signing secret once, stored encrypted', async () => {
    const res = await create(developer.sub);

    expect(res.status).toBe(201);
    const body = res.body as EndpointBody;
    expect(body).toEqual({
      id: expect.any(String) as unknown,
      url: 'https://hooks.example.test/operantix',
      description: 'Ops channel',
      eventTypes: ['execution.completed', 'execution.failed'],
      status: 'ACTIVE',
      consecutiveFailures: 0,
      createdAt: expect.any(String) as unknown,
      signingSecret: expect.stringMatching(/^whsec_[A-Za-z0-9_-]{43}$/) as unknown,
    });

    const stored = await storedSecret(body.id);
    expect(stored?.ciphertext.toString('latin1')).not.toContain(body.signingSecret);
    const plaintext = new SecretCipher(keyring).decrypt(
      { keyId: stored?.key_id ?? '', ciphertext: stored?.ciphertext ?? Buffer.alloc(0) },
      `${acme}/${stored?.id ?? ''}`,
    );
    expect(plaintext).toBe(body.signingSecret);
  });

  it('never returns the secret when reading endpoints', async () => {
    const created = (await create(developer.sub)).body as EndpointBody;
    const auth = await as(operator.sub);

    const list = await request(httpServer(app)).get(endpointsOf(acme)).set('Authorization', auth);
    const one = await request(httpServer(app))
      .get(`${endpointsOf(acme)}/${created.id}`)
      .set('Authorization', auth);

    expect(list.status).toBe(200);
    expect(one.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('whsec_');
    expect(one.body).not.toHaveProperty('signingSecret');
    expect((list.body as { data: EndpointBody[] }).data.map((e) => e.id)).toContain(created.id);
  });

  it('audits creation without the secret', async () => {
    const created = (await create(developer.sub)).body as EndpointBody;

    const { rows } = await database.ownerPool.query<{ action: string; metadata: unknown }>(
      'SELECT action, metadata FROM audit_entries WHERE resource_id = $1',
      [created.id],
    );
    expect(rows).toEqual([
      {
        action: 'webhook_endpoint.created',
        metadata: { url: created.url, eventTypes: created.eventTypes },
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain('whsec_');
  });

  it.each([
    ['a non-URL', { url: 'not a url', eventTypes: ['execution.completed'] }],
    ['a non-HTTP scheme', { url: 'ftp://files.example.test/', eventTypes: ['execution.failed'] }],
    [
      'credentials in the URL',
      { url: 'https://u:p@hooks.example.test/', eventTypes: ['execution.failed'] },
    ],
    ['no event types', { url: 'https://hooks.example.test/', eventTypes: [] }],
    ['an unknown event type', { url: 'https://hooks.example.test/', eventTypes: ['order.paid'] }],
  ])('rejects %s', async (_, body) => {
    const res = await create(developer.sub, body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('lets operators read but not manage endpoints, and keeps viewers out', async () => {
    const created = (await create(developer.sub)).body as EndpointBody;

    expect((await create(operator.sub)).status).toBe(403);
    const viewing = await request(httpServer(app))
      .get(endpointsOf(acme))
      .set('Authorization', await as(viewer.sub));
    expect(viewing.status).toBe(403);
    const deleting = await request(httpServer(app))
      .delete(`${endpointsOf(acme)}/${created.id}`)
      .set('Authorization', await as(operator.sub));
    expect(deleting.status).toBe(403);
  });

  it("hides another organization's endpoints", async () => {
    const created = (await create(developer.sub)).body as EndpointBody;
    const auth = await as(outsider.sub);

    const list = await request(httpServer(app)).get(endpointsOf(globex)).set('Authorization', auth);
    const peek = await request(httpServer(app))
      .get(`${endpointsOf(globex)}/${created.id}`)
      .set('Authorization', auth);
    const rotate = await request(httpServer(app))
      .post(`${endpointsOf(globex)}/${created.id}/rotate-secret`)
      .set('Authorization', auth);

    expect((list.body as { data: unknown[] }).data).toEqual([]);
    expect(peek.status).toBe(404);
    expect(peek.body).toMatchObject({ code: 'WEBHOOK_ENDPOINT_NOT_FOUND' });
    expect(rotate.status).toBe(404);
  });

  it('rotates the signing secret, replacing the stored one', async () => {
    const created = (await create(developer.sub)).body as EndpointBody;
    const before = await storedSecret(created.id);

    const res = await request(httpServer(app))
      .post(`${endpointsOf(acme)}/${created.id}/rotate-secret`)
      .set('Authorization', await as(developer.sub));

    expect(res.status).toBe(200);
    const rotated = res.body as EndpointBody;
    expect(rotated.id).toBe(created.id);
    expect(rotated.signingSecret).toMatch(/^whsec_/);
    expect(rotated.signingSecret).not.toBe(created.signingSecret);
    const after = await storedSecret(created.id);
    expect(after?.id).not.toBe(before?.id);
    const { rowCount } = await database.ownerPool.query('SELECT 1 FROM secrets WHERE id = $1', [
      before?.id,
    ]);
    expect(rowCount).toBe(0);
  });

  it('deletes an endpoint together with its secret', async () => {
    const created = (await create(developer.sub)).body as EndpointBody;
    const secret = await storedSecret(created.id);
    const auth = await as(developer.sub);

    const res = await request(httpServer(app))
      .delete(`${endpointsOf(acme)}/${created.id}`)
      .set('Authorization', auth);
    const again = await request(httpServer(app))
      .get(`${endpointsOf(acme)}/${created.id}`)
      .set('Authorization', auth);

    expect(res.status).toBe(204);
    expect(again.status).toBe(404);
    const { rowCount } = await database.ownerPool.query('SELECT 1 FROM secrets WHERE id = $1', [
      secret?.id,
    ]);
    expect(rowCount).toBe(0);
  });

  it('keeps secrets and endpoints behind row-level security', async () => {
    const { rows } = await database.ownerPool.query<{
      relname: string;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relname, relforcerowsecurity FROM pg_class
        WHERE relname IN ('secrets', 'webhook_endpoints') ORDER BY relname`,
    );

    expect(rows).toEqual([
      { relname: 'secrets', relforcerowsecurity: true },
      { relname: 'webhook_endpoints', relforcerowsecurity: true },
    ]);
  });
});
