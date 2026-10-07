import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
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

describe('workspaces API with tenant context, RBAC and audit', () => {
  let database: TenancyDatabase;
  let issuer: JwksIssuer;
  let app: INestApplication;
  const acme = randomUUID();
  const globex = randomUUID();
  const admin = { id: randomUUID(), sub: 'auth|admin' };
  const viewer = { id: randomUUID(), sub: 'auth|viewer' };
  const outsider = { id: randomUUID(), sub: 'auth|outsider' };

  beforeAll(async () => {
    [database, issuer] = await Promise.all([startTenancyDatabase(), startJwksIssuer()]);

    const owner = createDatabase(database.ownerPool);
    await owner.insert(organizations).values([
      { id: acme, name: 'Acme', slug: 'acme' },
      { id: globex, name: 'Globex', slug: 'globex' },
    ]);
    await owner.insert(workspaces).values([
      { organizationId: acme, name: 'Production', slug: 'production' },
      { organizationId: globex, name: 'Globex internal', slug: 'internal' },
    ]);
    await owner.insert(users).values(
      [admin, viewer, outsider].map((u) => ({
        id: u.id,
        authSubject: u.sub,
        email: `${u.sub.slice(5)}@example.test`,
        displayName: u.sub.slice(5),
      })),
    );
    await owner.insert(memberships).values([
      { organizationId: acme, userId: admin.id, role: 'ADMIN' },
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
  const workspacesOf = (org: string) => `/api/v1/organizations/${org}/workspaces`;

  it('lists only the workspaces of the organization the caller belongs to', async () => {
    const res = await request(httpServer(app))
      .get(workspacesOf(acme))
      .set('Authorization', await as(viewer.sub));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        {
          id: expect.any(String) as unknown,
          name: 'Production',
          slug: 'production',
          createdAt: expect.any(String) as unknown,
        },
      ],
    });
  });

  it('answers 404 to a caller from another organization', async () => {
    const res = await request(httpServer(app))
      .get(workspacesOf(acme))
      .set('Authorization', await as(outsider.sub));

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' });
  });

  it('answers 404 to an authenticated subject with no user record', async () => {
    const res = await request(httpServer(app))
      .get(workspacesOf(acme))
      .set('Authorization', await as('auth|unknown'));

    expect(res.status).toBe(404);
  });

  it('forbids a viewer from creating a workspace', async () => {
    const res = await request(httpServer(app))
      .post(workspacesOf(acme))
      .set('Authorization', await as(viewer.sub))
      .send({ name: 'Staging', slug: 'staging' });

    expect(res.status).toBe(403);
  });

  it('creates a workspace for an admin and records who did it', async () => {
    const res = await request(httpServer(app))
      .post(workspacesOf(acme))
      .set('Authorization', await as(admin.sub))
      .send({ name: 'Staging', slug: 'staging' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Staging', slug: 'staging' });
    const { rows } = await database.ownerPool.query(
      'SELECT organization_id, actor_user_id, action, resource_type, resource_id FROM audit_entries WHERE resource_id = $1',
      [(res.body as { id: string }).id],
    );
    expect(rows).toEqual([
      {
        organization_id: acme,
        actor_user_id: admin.id,
        action: 'workspace.created',
        resource_type: 'workspace',
        resource_id: (res.body as { id: string }).id,
      },
    ]);
  });

  it('answers 409 when the slug is already taken in the organization', async () => {
    const res = await request(httpServer(app))
      .post(workspacesOf(acme))
      .set('Authorization', await as(admin.sub))
      .send({ name: 'Production again', slug: 'production' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: 'WORKSPACE_SLUG_TAKEN',
      message: 'Workspace slug already in use',
    });
  });

  it('allows the same slug in another organization', async () => {
    const res = await request(httpServer(app))
      .post(workspacesOf(globex))
      .set('Authorization', await as(outsider.sub))
      .send({ name: 'Production', slug: 'production' });

    expect(res.status).toBe(201);
  });

  it('rejects an invalid body with the offending fields', async () => {
    const res = await request(httpServer(app))
      .post(workspacesOf(acme))
      .set('Authorization', await as(admin.sub))
      .send({ name: '', slug: 'Not A Slug' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields: expect.arrayContaining(['name', 'slug']) as unknown },
    });
  });

  it('keeps audit entries append-only for the API role', async () => {
    const appPool = new Pool({
      host: database.app.host,
      port: database.app.port,
      database: database.app.name,
      user: database.app.user,
      password: database.app.password,
    });
    try {
      const client = await appPool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.organization_id', $1, true)", [acme]);
        await expect(client.query("UPDATE audit_entries SET action = 'tampered'")).rejects.toThrow(
          /append-only/,
        );
        await client.query('ROLLBACK');
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.organization_id', $1, true)", [acme]);
        await expect(client.query('DELETE FROM audit_entries')).rejects.toThrow(/append-only/);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    } finally {
      await appPool.end();
    }
  });
});
