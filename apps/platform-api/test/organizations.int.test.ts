import 'reflect-metadata';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config/config';
import { AUDIENCE, ISSUER, type JwksIssuer, startJwksIssuer } from './support/jwks-issuer';
import { startTenancyDatabase, type TenancyDatabase } from './support/tenancy-database';

const httpServer = (app: INestApplication): Server => app.getHttpServer() as Server;
// Redis is not needed to exercise the API.
const CLOSED_PORT = 1;

interface OrganizationBody {
  id: string;
  name: string;
  slug: string;
}

describe('organization onboarding', () => {
  let database: TenancyDatabase;
  let issuer: JwksIssuer;
  let app: INestApplication;

  beforeAll(async () => {
    [database, issuer] = await Promise.all([startTenancyDatabase(), startJwksIssuer()]);
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

  const as = async (sub: string, claims: Record<string, unknown> = {}) =>
    `Bearer ${await issuer.token(sub, claims)}`;

  const createOrganization = async (sub: string, body: object, claims = {}) =>
    request(httpServer(app))
      .post('/v1/organizations')
      .set('Authorization', await as(sub, claims))
      .send(body);

  it('creates an organization, provisions the caller and makes them its owner', async () => {
    const res = await createOrganization(
      'auth|ana',
      { name: 'Acme', slug: 'acme' },
      { email: 'ana@acme.test', name: 'Ana' },
    );

    expect(res.status).toBe(201);
    const org = res.body as OrganizationBody;
    expect(org).toMatchObject({ name: 'Acme', slug: 'acme' });

    const { rows: users } = await database.ownerPool.query(
      'SELECT email, display_name FROM users WHERE auth_subject = $1',
      ['auth|ana'],
    );
    expect(users).toEqual([{ email: 'ana@acme.test', display_name: 'Ana' }]);

    // As owner, the creator can use tenant-scoped endpoints right away.
    const workspace = await request(httpServer(app))
      .post(`/v1/organizations/${org.id}/workspaces`)
      .set('Authorization', await as('auth|ana'))
      .send({ name: 'Production', slug: 'production' });
    expect(workspace.status).toBe(201);

    const { rows: audit } = await database.ownerPool.query(
      'SELECT action, resource_id FROM audit_entries WHERE organization_id = $1 ORDER BY occurred_at',
      [org.id],
    );
    expect(audit).toEqual([
      { action: 'organization.created', resource_id: org.id },
      { action: 'workspace.created', resource_id: expect.any(String) as unknown },
    ]);
  });

  it('provisions a caller whose token has no profile claims', async () => {
    const res = await createOrganization('auth|bare', { name: 'Bare', slug: 'bare' });

    expect(res.status).toBe(201);
  });

  it('reuses the user record on later organizations', async () => {
    const res = await createOrganization('auth|ana', { name: 'Acme Labs', slug: 'acme-labs' });

    expect(res.status).toBe(201);
    const { rows } = await database.ownerPool.query(
      'SELECT count(*)::int AS n FROM users WHERE auth_subject = $1',
      ['auth|ana'],
    );
    expect(rows).toEqual([{ n: 1 }]);
  });

  it('answers 409 when the slug is taken', async () => {
    const res = await createOrganization('auth|bruno', { name: 'Fake Acme', slug: 'acme' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'ORGANIZATION_SLUG_TAKEN',
      message: 'Organization slug already in use',
    });
  });

  it('rejects an invalid body', async () => {
    const res = await createOrganization('auth|bruno', { name: ' ', slug: '-x-' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('lists only the organizations of the caller, with their role', async () => {
    await createOrganization('auth|bruno', { name: 'Globex', slug: 'globex' });

    const res = await request(httpServer(app))
      .get('/v1/organizations')
      .set('Authorization', await as('auth|ana'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        { id: expect.any(String) as unknown, name: 'Acme', slug: 'acme', role: 'OWNER' },
        { id: expect.any(String) as unknown, name: 'Acme Labs', slug: 'acme-labs', role: 'OWNER' },
      ],
    });
  });

  it('lists nothing for a caller without a user record', async () => {
    const res = await request(httpServer(app))
      .get('/v1/organizations')
      .set('Authorization', await as('auth|newcomer'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it('requires authentication', async () => {
    const res = await request(httpServer(app)).get('/v1/organizations');

    expect(res.status).toBe(401);
  });
});
