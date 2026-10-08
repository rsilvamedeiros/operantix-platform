import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config/config';
import { buildOpenApiDocument, documentedResponse } from '../src/openapi/openapi.document';
import { AUDIENCE, ISSUER, type JwksIssuer, startJwksIssuer } from './support/jwks-issuer';
import { testKeyring } from './support/secrets';
import { startTenancyDatabase, type TenancyDatabase } from './support/tenancy-database';

const httpServer = (app: INestApplication): Server => app.getHttpServer() as Server;
// Redis is not needed to exercise the API.
const CLOSED_PORT = 1;

/**
 * Walks the main flow and checks every response against the schema the OpenAPI document
 * publishes for that operation and status, so the spec cannot drift from what the API returns.
 */
describe('API responses match the OpenAPI contract', () => {
  let database: TenancyDatabase;
  let issuer: JwksIssuer;
  let app: INestApplication;
  let auth: string;

  beforeAll(async () => {
    [database, issuer] = await Promise.all([startTenancyDatabase(), startJwksIssuer()]);
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
    auth = `Bearer ${await issuer.token('auth|contract', { email: 'c@example.test' })}`;
  });

  afterAll(async () => {
    await app.close();
    await issuer.close();
    await database.stop();
  });

  const call = async (
    method: 'get' | 'post' | 'put' | 'delete',
    template: string,
    params: Record<string, string>,
    body?: object,
  ) => {
    const path = template.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? '');
    const req = request(httpServer(app))[method](path).set('Authorization', auth);
    const res = body ? await req.send(body) : await req;
    const schema = documentedResponse(method, template, String(res.status));
    expect(
      schema,
      `${method.toUpperCase()} ${template} ${String(res.status)} is documented`,
    ).toBeDefined();
    schema?.parse(res.body);
    return res;
  };

  it('serves the document publicly', async () => {
    const res = await request(httpServer(app)).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(buildOpenApiDocument());
  });

  it('covers the organization, workspace and workflow lifecycle', async () => {
    const definition = {
      schemaVersion: 1,
      trigger: { type: 'manual' },
      steps: [{ id: 'note', name: 'Note', type: 'log', config: { message: 'hi' } }],
    };

    await call('get', '/api/v1/me', {});
    const org = await call(
      'post',
      '/api/v1/organizations',
      {},
      { name: 'Contract', slug: 'contract' },
    );
    const organizationId = (org.body as { id: string }).id;
    await call('get', '/api/v1/organizations', {});
    await call('post', '/api/v1/organizations', {}, { name: 'Dup', slug: 'contract' }); // 409

    const ws = await call(
      'post',
      '/api/v1/organizations/{organizationId}/workspaces',
      { organizationId },
      { name: 'Prod', slug: 'prod' },
    );
    const workspaceId = (ws.body as { id: string }).id;
    await call('get', '/api/v1/organizations/{organizationId}/workspaces', { organizationId });

    const base = '/api/v1/organizations/{organizationId}';
    const wf = await call(
      'post',
      `${base}/workspaces/{workspaceId}/workflows`,
      { organizationId, workspaceId },
      { name: 'Flow', key: 'flow', definition },
    );
    const workflowId = (wf.body as { id: string }).id;
    const ids = { organizationId, workspaceId, workflowId };
    await call('post', `${base}/workspaces/{workspaceId}/workflows`, ids, { name: 'x' }); // 400
    await call('get', `${base}/workspaces/{workspaceId}/workflows`, ids);
    await call('post', `${base}/workflows/{workflowId}/versions`, ids, { definition });
    await call('get', `${base}/workflows/{workflowId}`, ids);
    await call('get', `${base}/workflows/{workflowId}/versions/{version}`, {
      ...ids,
      version: '2',
    });
    await call('get', `${base}/workflows/{workflowId}/versions/{version}`, {
      ...ids,
      version: '9',
    }); // 404
    await call('put', `${base}/workflows/{workflowId}/activation`, ids, { version: 2 });
    await call('delete', `${base}/workflows/{workflowId}/activation`, ids);

    await call('post', `${base}/workflows/{workflowId}/executions`, ids, {}); // 409 inactive
    await call('put', `${base}/workflows/{workflowId}/activation`, ids, { version: 2 });
    const execution = await call('post', `${base}/workflows/{workflowId}/executions`, ids, {
      input: { orderId: 'o-1' },
    });
    const executionId = (execution.body as { id: string }).id;
    await call('get', `${base}/workflows/{workflowId}/executions`, ids);
    await call('get', `${base}/executions/{executionId}`, { ...ids, executionId });
    await call('get', `${base}/executions/{executionId}/timeline`, { ...ids, executionId });

    // The worker parks a delay step as WAITING; the API must document that state.
    await database.ownerPool.query(
      `UPDATE step_executions SET status = 'WAITING', attempts = 1 WHERE execution_id = $1`,
      [executionId],
    );
    const waiting = await call('get', `${base}/executions/{executionId}`, { ...ids, executionId });
    expect((waiting.body as { steps: { status: string }[] }).steps[0]?.status).toBe('WAITING');

    const endpoint = await call('post', `${base}/webhook-endpoints`, ids, {
      url: 'https://hooks.example.test/contract',
      eventTypes: ['execution.completed'],
    });
    const endpointId = (endpoint.body as { id: string }).id;
    const endpointIds = { ...ids, endpointId };
    await call('post', `${base}/webhook-endpoints`, ids, { url: 'nope', eventTypes: [] }); // 400
    await call('get', `${base}/webhook-endpoints`, ids);
    await call('get', `${base}/webhook-endpoints/{endpointId}`, endpointIds);
    await call('post', `${base}/webhook-endpoints/{endpointId}/rotate-secret`, endpointIds);
    await call('put', `${base}/webhook-endpoints/{endpointId}/status`, endpointIds, {
      status: 'DISABLED',
    });
    await call('put', `${base}/webhook-endpoints/{endpointId}/status`, endpointIds, {
      status: 'PAUSED',
    }); // 400
    const { rows: seeded } = await database.ownerPool.query<{ id: string }>(
      `INSERT INTO webhook_deliveries (organization_id, endpoint_id, event_id, event_type, payload, status)
       VALUES ($1, $2, gen_random_uuid(), 'execution.completed', '{}', 'FAILED') RETURNING id`,
      [organizationId, endpointId],
    );
    const deliveryIds = { ...endpointIds, deliveryId: seeded[0]?.id ?? '' };
    await call('get', `${base}/webhook-endpoints/{endpointId}/deliveries`, endpointIds);
    await call(
      'get',
      `${base}/webhook-endpoints/{endpointId}/deliveries/{deliveryId}`,
      deliveryIds,
    );
    await call(
      'post',
      `${base}/webhook-endpoints/{endpointId}/deliveries/{deliveryId}/retry`,
      deliveryIds,
    ); // 409 disabled
    await call('put', `${base}/webhook-endpoints/{endpointId}/status`, endpointIds, {
      status: 'ACTIVE',
    });
    await call(
      'post',
      `${base}/webhook-endpoints/{endpointId}/deliveries/{deliveryId}/retry`,
      deliveryIds,
    );
    await call('delete', `${base}/webhook-endpoints/{endpointId}`, endpointIds);
    await call('get', `${base}/webhook-endpoints/{endpointId}`, endpointIds); // 404

    const hook = await call('post', `${base}/inbound-webhooks`, ids, { workflowId });
    const { id: inboundWebhookId, signingSecret } = hook.body as {
      id: string;
      signingSecret: string;
    };
    const hookIds = { ...ids, inboundWebhookId };
    await call('post', `${base}/inbound-webhooks`, ids, { workflowId: 'nope' }); // 400
    await call('get', `${base}/inbound-webhooks`, ids);
    await call('get', `${base}/inbound-webhooks/{inboundWebhookId}`, hookIds);
    const rotated = await call(
      'post',
      `${base}/inbound-webhooks/{inboundWebhookId}/rotate-secret`,
      hookIds,
    );
    const receive = async (secret: string, key: string) => {
      const template = '/hooks/v1/{organizationId}/{inboundWebhookId}';
      const body = JSON.stringify({ orderId: 'o-2' });
      const at = String(Math.floor(Date.now() / 1000));
      const v1 = createHmac('sha256', secret).update(`${at}.${body}`).digest('hex');
      const res = await request(httpServer(app))
        .post(`/hooks/v1/${organizationId}/${inboundWebhookId}`)
        .set('Content-Type', 'application/json')
        .set('Operantix-Signature', `t=${at},v1=${v1}`)
        .set('Idempotency-Key', key)
        .send(body);
      const schema = documentedResponse('post', template, String(res.status));
      expect(schema, `POST ${template} ${String(res.status)} is documented`).toBeDefined();
      schema?.parse(res.body);
    };
    await receive(signingSecret, 'k-1'); // 401, rotated away
    const fresh = (rotated.body as { signingSecret: string }).signingSecret;
    await receive(fresh, 'k-1'); // 202
    await receive(fresh, 'k-1'); // 200 replay
    await call('delete', `${base}/inbound-webhooks/{inboundWebhookId}`, hookIds);
    await call('get', `${base}/inbound-webhooks/{inboundWebhookId}`, hookIds); // 404
    await receive(fresh, 'k-2'); // 404
  });
});
