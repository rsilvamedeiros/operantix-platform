import 'reflect-metadata';
import { createHmac, randomUUID } from 'node:crypto';
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

const definition = {
  schemaVersion: 1,
  trigger: { type: 'manual' },
  steps: [{ id: 'note', name: 'Note', type: 'log', config: { message: 'received' } }],
};

interface HookBody {
  id: string;
  workflowId: string;
  path: string;
  signingSecret?: string;
}

/** Signs like a sender following docs/api/webhooks.md. */
const sign = (secret: string, body: string, at = Math.floor(Date.now() / 1000)): string =>
  `t=${String(at)},v1=${createHmac('sha256', secret)
    .update(`${String(at)}.${body}`)
    .digest('hex')}`;

describe('inbound webhooks', () => {
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
  const hooksOf = (org: string) => `/api/v1/organizations/${org}/inbound-webhooks`;

  const workflow = async (active = true): Promise<string> => {
    const id = randomUUID();
    await database.ownerPool.query(
      `INSERT INTO workflows (id, organization_id, workspace_id, key, name) VALUES ($1, $2, $3, $4, $4)`,
      [id, acme, production, `wf-${id.slice(0, 8)}`],
    );
    await database.ownerPool.query(
      `INSERT INTO workflow_versions (organization_id, workflow_id, version, definition, created_by)
       VALUES ($1, $2, 1, $3, $4)`,
      [acme, id, JSON.stringify(definition), developer.id],
    );
    if (active) {
      await database.ownerPool.query('UPDATE workflows SET active_version = 1 WHERE id = $1', [id]);
    }
    return id;
  };

  const createHook = async (workflowId: string): Promise<HookBody> => {
    const res = await request(httpServer(app))
      .post(hooksOf(acme))
      .set('Authorization', await as(developer.sub))
      .send({ workflowId, description: 'CRM leads' });
    return res.body as HookBody;
  };

  const deliver = (
    path: string,
    body: string,
    headers: Record<string, string>,
    contentType = 'application/json',
  ) => {
    const req = request(httpServer(app)).post(path).set('Content-Type', contentType);
    for (const [name, value] of Object.entries(headers)) req.set(name, value);
    return req.send(body);
  };

  describe('management', () => {
    it('creates a webhook for a workflow and shows its secret once', async () => {
      const workflowId = await workflow();

      const created = await request(httpServer(app))
        .post(hooksOf(acme))
        .set('Authorization', await as(developer.sub))
        .send({ workflowId, description: 'CRM leads' });
      const id = (created.body as HookBody).id;
      const read = await request(httpServer(app))
        .get(`${hooksOf(acme)}/${id}`)
        .set('Authorization', await as(operator.sub));
      const listed = await request(httpServer(app))
        .get(hooksOf(acme))
        .set('Authorization', await as(operator.sub));

      expect(created.status).toBe(201);
      expect(created.body).toEqual({
        id: expect.any(String) as unknown,
        workflowId,
        description: 'CRM leads',
        path: `/hooks/v1/${acme}/${id}`,
        createdAt: expect.any(String) as unknown,
        signingSecret: expect.stringMatching(/^whsec_[A-Za-z0-9_-]{43}$/) as unknown,
      });
      expect(read.status).toBe(200);
      expect(read.body).not.toHaveProperty('signingSecret');
      expect((listed.body as { data: HookBody[] }).data.map((h) => h.id)).toContain(id);
      const { rows } = await database.ownerPool.query<{ action: string }>(
        'SELECT action FROM audit_entries WHERE resource_id = $1',
        [id],
      );
      expect(rows).toEqual([{ action: 'inbound_webhook.created' }]);
    });

    it('refuses a workflow the organization does not have', async () => {
      const res = await request(httpServer(app))
        .post(hooksOf(acme))
        .set('Authorization', await as(developer.sub))
        .send({ workflowId: randomUUID() });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'WORKFLOW_NOT_FOUND' });
    });

    it('lets operators read webhooks but not manage them', async () => {
      const res = await request(httpServer(app))
        .post(hooksOf(acme))
        .set('Authorization', await as(operator.sub))
        .send({ workflowId: await workflow() });

      expect(res.status).toBe(403);
    });

    it("hides another tenant's webhooks", async () => {
      const hook = await createHook(await workflow());

      const res = await request(httpServer(app))
        .get(`${hooksOf(globex)}/${hook.id}`)
        .set('Authorization', await as(outsider.sub));

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'INBOUND_WEBHOOK_NOT_FOUND' });
    });
  });

  describe('receiving', () => {
    it('starts an execution of the workflow with the body as input', async () => {
      const workflowId = await workflow();
      const hook = await createHook(workflowId);
      const body = JSON.stringify({ lead: { email: 'ana@example.test' } });

      const res = await deliver(hook.path, body, {
        'Operantix-Signature': sign(hook.signingSecret ?? '', body),
        'Idempotency-Key': 'lead-1',
      });

      expect(res.status).toBe(202);
      const executionId = (res.body as { executionId: string }).executionId;
      const { rows } = await database.ownerPool.query<{
        workflow_id: string;
        trigger_type: string;
        input: unknown;
      }>('SELECT workflow_id, trigger_type, input FROM executions WHERE id = $1', [executionId]);
      expect(rows).toEqual([
        {
          workflow_id: workflowId,
          trigger_type: 'webhook',
          input: { lead: { email: 'ana@example.test' } },
        },
      ]);
      const { rows: events } = await database.ownerPool.query<{ details: unknown }>(
        `SELECT details FROM execution_events WHERE execution_id = $1 AND type = 'execution.created'`,
        [executionId],
      );
      expect(events[0]?.details).toMatchObject({
        triggerType: 'webhook',
        inboundWebhookId: hook.id,
      });
    });

    it('returns the same execution when a delivery is repeated', async () => {
      const hook = await createHook(await workflow());
      const body = JSON.stringify({ n: 1 });
      const headers = {
        'Operantix-Signature': sign(hook.signingSecret ?? '', body),
        'Idempotency-Key': 'retry-me',
      };

      const first = await deliver(hook.path, body, headers);
      const again = await deliver(hook.path, body, headers);
      const other = JSON.stringify({ n: 2 });
      const reused = await deliver(hook.path, other, {
        'Operantix-Signature': sign(hook.signingSecret ?? '', other),
        'Idempotency-Key': 'retry-me',
      });

      expect(first.status).toBe(202);
      expect(again.status).toBe(200);
      expect(again.body).toEqual(first.body);
      expect(reused.status).toBe(409);
      expect(reused.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    });

    it.each([
      ['no signature', () => ({})],
      [
        'a signature from another secret',
        (body: string) => ({
          'Operantix-Signature': sign('whsec_other', body),
        }),
      ],
      [
        'a stale timestamp',
        (body: string, secret: string) => ({
          'Operantix-Signature': sign(secret, body, Math.floor(Date.now() / 1000) - 600),
        }),
      ],
      [
        'a timestamp from the future',
        (body: string, secret: string) => ({
          'Operantix-Signature': sign(secret, body, Math.floor(Date.now() / 1000) + 600),
        }),
      ],
      ['a malformed header', () => ({ 'Operantix-Signature': 'v1=abc' })],
      [
        'a signature over another body',
        (_: string, secret: string) => ({
          'Operantix-Signature': sign(secret, '{"tampered":true}'),
        }),
      ],
    ])('rejects a delivery with %s', async (_, headers) => {
      const hook = await createHook(await workflow());
      const body = JSON.stringify({ ok: true });

      const res = await deliver(hook.path, body, {
        ...headers(body, hook.signingSecret ?? ''),
        'Idempotency-Key': 'k',
      });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        code: 'WEBHOOK_SIGNATURE_INVALID',
        message: 'Webhook signature is missing, invalid or expired',
      });
    });

    it('requires an idempotency key', async () => {
      const hook = await createHook(await workflow());
      const body = '{}';

      const res = await deliver(hook.path, body, {
        'Operantix-Signature': sign(hook.signingSecret ?? '', body),
      });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('accepts only a JSON object', async () => {
      const hook = await createHook(await workflow());
      const array = '[1,2]';
      const text = 'hello';

      const notObject = await deliver(hook.path, array, {
        'Operantix-Signature': sign(hook.signingSecret ?? '', array),
        'Idempotency-Key': 'a',
      });
      const notJson = await deliver(
        hook.path,
        text,
        { 'Operantix-Signature': sign(hook.signingSecret ?? '', text), 'Idempotency-Key': 'b' },
        'text/plain',
      );

      expect(notObject.status).toBe(400);
      expect(notJson.status).toBe(415);
      expect(notJson.body).toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' });
    });

    it('answers 404 for an unknown webhook or one addressed through another organization', async () => {
      const hook = await createHook(await workflow());
      const body = '{}';
      const headers = {
        'Operantix-Signature': sign(hook.signingSecret ?? '', body),
        'Idempotency-Key': 'x',
      };

      const unknown = await deliver(`/hooks/v1/${acme}/${randomUUID()}`, body, headers);
      const crossTenant = await deliver(`/hooks/v1/${globex}/${hook.id}`, body, headers);
      const notUuid = await deliver(`/hooks/v1/${acme}/nope`, body, headers);

      for (const res of [unknown, crossTenant, notUuid]) {
        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ code: 'INBOUND_WEBHOOK_NOT_FOUND' });
      }
    });

    it('refuses to start an inactive workflow', async () => {
      const hook = await createHook(await workflow(false));
      const body = '{}';

      const res = await deliver(hook.path, body, {
        'Operantix-Signature': sign(hook.signingSecret ?? '', body),
        'Idempotency-Key': 'inactive',
      });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'WORKFLOW_INACTIVE' });
    });

    it('stops accepting the old secret after a rotation and everything after deletion', async () => {
      const hook = await createHook(await workflow());
      const auth = await as(developer.sub);
      const rotated = await request(httpServer(app))
        .post(`${hooksOf(acme)}/${hook.id}/rotate-secret`)
        .set('Authorization', auth);
      const newSecret = (rotated.body as HookBody).signingSecret ?? '';
      const body = '{}';

      const withOld = await deliver(hook.path, body, {
        'Operantix-Signature': sign(hook.signingSecret ?? '', body),
        'Idempotency-Key': 'old',
      });
      const withNew = await deliver(hook.path, body, {
        'Operantix-Signature': sign(newSecret, body),
        'Idempotency-Key': 'new',
      });
      const deleted = await request(httpServer(app))
        .delete(`${hooksOf(acme)}/${hook.id}`)
        .set('Authorization', auth);
      const afterDelete = await deliver(hook.path, body, {
        'Operantix-Signature': sign(newSecret, body),
        'Idempotency-Key': 'gone',
      });

      expect(rotated.status).toBe(200);
      expect(newSecret).not.toBe(hook.signingSecret);
      expect(withOld.status).toBe(401);
      expect(withNew.status).toBe(202);
      expect(deleted.status).toBe(204);
      expect(afterDelete.status).toBe(404);
      const { rows } = await database.ownerPool.query<{ count: string }>(
        `SELECT count(*) FROM secrets WHERE organization_id = $1 AND kind = 'WEBHOOK_INBOUND'
           AND id NOT IN (SELECT signing_secret_id FROM inbound_webhooks)`,
        [acme],
      );
      expect(rows[0]?.count).toBe('0');
    });
  });
});
