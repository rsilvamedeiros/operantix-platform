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
import { organizations } from '../src/organizations/organizations.schema';
import { AUDIENCE, ISSUER, type JwksIssuer, startJwksIssuer } from './support/jwks-issuer';
import { testKeyring } from './support/secrets';
import { startTenancyDatabase, type TenancyDatabase } from './support/tenancy-database';

const httpServer = (app: INestApplication): Server => app.getHttpServer() as Server;
const CLOSED_PORT = 1;

interface DeliveryBody {
  id: string;
  eventId: string;
  status: string;
  attempts: number;
}

describe('webhook deliveries API', () => {
  let database: TenancyDatabase;
  let issuer: JwksIssuer;
  let app: INestApplication;
  const acme = randomUUID();
  const globex = randomUUID();
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
  const endpointsOf = (org: string) => `/api/v1/organizations/${org}/webhook-endpoints`;

  const createEndpoint = async (): Promise<string> => {
    const res = await request(httpServer(app))
      .post(endpointsOf(acme))
      .set('Authorization', await as(developer.sub))
      .send({ url: 'https://hooks.example.test/', eventTypes: ['execution.completed'] });
    return (res.body as { id: string }).id;
  };

  /** Inserts a delivery as the integration worker would, oldest first by `ageSeconds`. */
  const seedDelivery = async (
    endpointId: string,
    options: { status?: string; attempts?: number; ageSeconds?: number } = {},
  ): Promise<string> => {
    const { rows } = await database.ownerPool.query<{ id: string }>(
      `INSERT INTO webhook_deliveries
         (organization_id, endpoint_id, event_id, event_type, payload, status, attempts,
          last_status_code, last_error_code, created_at)
       VALUES ($1, $2, $3, 'execution.completed', '{}', $4, $5, 503, 'HTTP_STATUS',
               now() - make_interval(secs => $6))
       RETURNING id`,
      [
        acme,
        endpointId,
        randomUUID(),
        options.status ?? 'FAILED',
        options.attempts ?? 3,
        options.ageSeconds ?? 0,
      ],
    );
    return rows[0]?.id ?? '';
  };

  it('lists deliveries newest first, a page at a time', async () => {
    const endpointId = await createEndpoint();
    const oldest = await seedDelivery(endpointId, { ageSeconds: 30 });
    const middle = await seedDelivery(endpointId, { ageSeconds: 20 });
    const newest = await seedDelivery(endpointId, { ageSeconds: 10 });
    const auth = await as(operator.sub);

    const first = await request(httpServer(app))
      .get(`${endpointsOf(acme)}/${endpointId}/deliveries?limit=2`)
      .set('Authorization', auth);
    const firstPage = first.body as { data: DeliveryBody[]; nextCursor: string | null };
    const second = await request(httpServer(app))
      .get(
        `${endpointsOf(acme)}/${endpointId}/deliveries?limit=2&cursor=${firstPage.nextCursor ?? ''}`,
      )
      .set('Authorization', auth);

    expect(first.status).toBe(200);
    expect(firstPage.data.map((d) => d.id)).toEqual([newest, middle]);
    expect(firstPage.data[0]).toMatchObject({
      status: 'FAILED',
      attempts: 3,
      lastStatusCode: 503,
      lastErrorCode: 'HTTP_STATUS',
      eventType: 'execution.completed',
    });
    expect(second.body).toEqual({
      data: [expect.objectContaining({ id: oldest })],
      nextCursor: null,
    });
  });

  it('rejects an invalid cursor', async () => {
    const endpointId = await createEndpoint();

    const res = await request(httpServer(app))
      .get(`${endpointsOf(acme)}/${endpointId}/deliveries?cursor=garbage`)
      .set('Authorization', await as(operator.sub));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('shows a delivery with its attempts in order', async () => {
    const endpointId = await createEndpoint();
    const deliveryId = await seedDelivery(endpointId, { attempts: 2 });
    await database.ownerPool.query(
      `INSERT INTO webhook_delivery_attempts (organization_id, delivery_id, attempt, status_code, error_code, duration_ms)
       VALUES ($1, $2, 2, 503, 'HTTP_STATUS', 40), ($1, $2, 1, NULL, 'HTTP_TIMEOUT', 10000)`,
      [acme, deliveryId],
    );

    const res = await request(httpServer(app))
      .get(`${endpointsOf(acme)}/${endpointId}/deliveries/${deliveryId}`)
      .set('Authorization', await as(operator.sub));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: deliveryId,
      attempts: 2,
      attemptHistory: [
        { attempt: 1, statusCode: null, errorCode: 'HTTP_TIMEOUT', durationMs: 10000 },
        { attempt: 2, statusCode: 503, errorCode: 'HTTP_STATUS', durationMs: 40 },
      ],
    });
  });

  it("hides another endpoint's or tenant's deliveries", async () => {
    const endpointId = await createEndpoint();
    const otherEndpoint = await createEndpoint();
    const deliveryId = await seedDelivery(endpointId);

    const viaOtherEndpoint = await request(httpServer(app))
      .get(`${endpointsOf(acme)}/${otherEndpoint}/deliveries/${deliveryId}`)
      .set('Authorization', await as(developer.sub));
    const viaOtherTenant = await request(httpServer(app))
      .get(`${endpointsOf(globex)}/${endpointId}/deliveries`)
      .set('Authorization', await as(outsider.sub));

    expect(viaOtherEndpoint.status).toBe(404);
    expect(viaOtherEndpoint.body).toMatchObject({ code: 'WEBHOOK_DELIVERY_NOT_FOUND' });
    expect(viaOtherTenant.status).toBe(404);
    expect(viaOtherTenant.body).toMatchObject({ code: 'WEBHOOK_ENDPOINT_NOT_FOUND' });
  });

  it('retries a failed delivery from scratch and audits it', async () => {
    const endpointId = await createEndpoint();
    const deliveryId = await seedDelivery(endpointId);

    const res = await request(httpServer(app))
      .post(`${endpointsOf(acme)}/${endpointId}/deliveries/${deliveryId}/retry`)
      .set('Authorization', await as(developer.sub));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: deliveryId,
      status: 'PENDING',
      attempts: 0,
      completedAt: null,
    });
    const { rows } = await database.ownerPool.query<{ action: string }>(
      'SELECT action FROM audit_entries WHERE resource_id = $1',
      [deliveryId],
    );
    expect(rows).toEqual([{ action: 'webhook_delivery.retried' }]);
  });

  it('only retries failed deliveries of active endpoints', async () => {
    const endpointId = await createEndpoint();
    const pending = await seedDelivery(endpointId, { status: 'PENDING' });
    const failed = await seedDelivery(endpointId);
    const auth = await as(developer.sub);

    const notFailed = await request(httpServer(app))
      .post(`${endpointsOf(acme)}/${endpointId}/deliveries/${pending}/retry`)
      .set('Authorization', auth);
    await database.ownerPool.query(
      `UPDATE webhook_endpoints SET status = 'DISABLED' WHERE id = $1`,
      [endpointId],
    );
    const disabled = await request(httpServer(app))
      .post(`${endpointsOf(acme)}/${endpointId}/deliveries/${failed}/retry`)
      .set('Authorization', auth);

    expect(notFailed.status).toBe(409);
    expect(notFailed.body).toMatchObject({ code: 'WEBHOOK_DELIVERY_NOT_FAILED' });
    expect(disabled.status).toBe(409);
    expect(disabled.body).toMatchObject({ code: 'WEBHOOK_ENDPOINT_DISABLED' });
  });

  it('re-enables a disabled endpoint, clearing its failure count', async () => {
    const endpointId = await createEndpoint();
    await database.ownerPool.query(
      `UPDATE webhook_endpoints SET status = 'DISABLED', consecutive_failures = 20 WHERE id = $1`,
      [endpointId],
    );
    const auth = await as(developer.sub);

    const enabled = await request(httpServer(app))
      .put(`${endpointsOf(acme)}/${endpointId}/status`)
      .set('Authorization', auth)
      .send({ status: 'ACTIVE' });
    const again = await request(httpServer(app))
      .put(`${endpointsOf(acme)}/${endpointId}/status`)
      .set('Authorization', auth)
      .send({ status: 'ACTIVE' });
    const disabled = await request(httpServer(app))
      .put(`${endpointsOf(acme)}/${endpointId}/status`)
      .set('Authorization', auth)
      .send({ status: 'DISABLED' });

    expect(enabled.status).toBe(200);
    expect(enabled.body).toMatchObject({ status: 'ACTIVE', consecutiveFailures: 0 });
    expect(again.body).toMatchObject({ status: 'ACTIVE' });
    expect(disabled.body).toMatchObject({ status: 'DISABLED' });
    const { rows } = await database.ownerPool.query<{ action: string }>(
      `SELECT action FROM audit_entries WHERE resource_id = $1 AND action LIKE 'webhook_endpoint.%abled'
        ORDER BY occurred_at`,
      [endpointId],
    );
    // The no-op second call is not audited.
    expect(rows.map((r) => r.action)).toEqual([
      'webhook_endpoint.enabled',
      'webhook_endpoint.disabled',
    ]);
  });

  it('rejects an unknown status', async () => {
    const endpointId = await createEndpoint();

    const res = await request(httpServer(app))
      .put(`${endpointsOf(acme)}/${endpointId}/status`)
      .set('Authorization', await as(developer.sub))
      .send({ status: 'PAUSED' });

    expect(res.status).toBe(400);
  });

  it('lets operators read deliveries but not retry them or change endpoints', async () => {
    const endpointId = await createEndpoint();
    const deliveryId = await seedDelivery(endpointId);
    const auth = await as(operator.sub);

    const retry = await request(httpServer(app))
      .post(`${endpointsOf(acme)}/${endpointId}/deliveries/${deliveryId}/retry`)
      .set('Authorization', auth);
    const status = await request(httpServer(app))
      .put(`${endpointsOf(acme)}/${endpointId}/status`)
      .set('Authorization', auth)
      .send({ status: 'DISABLED' });

    expect(retry.status).toBe(403);
    expect(status.status).toBe(403);
  });
});
