import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkflowStep } from '../engine.schema';
import { HttpRequestStep } from './http-request-step';
import { StepError } from './step-error';

interface Received {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingMessage['headers'];
  body: string;
}

const context = {
  organizationId: 'org-1',
  executionId: 'exec-1',
  input: {},
  stepStartedAt: new Date(),
};

describe('HttpRequestStep', () => {
  let server: Server;
  let base: string;
  const received: Received[] = [];
  const routes: Record<string, (res: ServerResponse) => void> = {
    '/ok': (res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    },
    '/text': (res) => res.end('plain answer'),
    '/badjson': (res) => {
      res.setHeader('content-type', 'application/json');
      res.end('{not json');
    },
    '/big': (res) => res.end('x'.repeat(5_000)),
    '/missing': (res) => {
      res.statusCode = 404;
      res.end('nope');
    },
    '/busy': (res) => {
      res.statusCode = 503;
      res.end('try later');
    },
    '/throttled': (res) => {
      res.statusCode = 429;
      res.end();
    },
    '/moved': (res) => {
      res.statusCode = 302;
      res.setHeader('location', 'http://169.254.169.254/latest/meta-data');
      res.end();
    },
    '/slow': () => {
      // Never answers; the step's timeout must fire.
    },
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, headers: req.headers, body });
        const route = routes[req.url ?? ''];
        if (route) route(res);
        else res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const local = new HttpRequestStep({
    timeoutMs: 300,
    allowPrivateNetworks: true,
    maxResponseBytes: 1_000,
  });
  const strict = new HttpRequestStep({
    timeoutMs: 300,
    allowPrivateNetworks: false,
    maxResponseBytes: 1_000,
  });
  const step = (config: Record<string, unknown>): WorkflowStep => ({
    id: 'call',
    name: 'Call',
    type: 'http_request',
    config,
  });
  const failure = async (promise: Promise<unknown>) => {
    const error: unknown = await promise.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(StepError);
    return error as StepError;
  };

  it('sends the request with a stable idempotency key and returns status and JSON body', async () => {
    const output = await local.run(
      step({
        method: 'POST',
        url: `${base}/ok`,
        headers: { 'X-Ticket': 'INC-1' },
        body: { orderId: 'o-1' },
      }),
      context,
    );

    expect(output).toEqual({ status: 200, body: { ok: true } });
    const request = received.at(-1);
    expect(request).toMatchObject({ method: 'POST', url: '/ok', body: '{"orderId":"o-1"}' });
    expect(request?.headers).toMatchObject({
      'x-ticket': 'INC-1',
      'content-type': 'application/json',
      'idempotency-key': 'exec-1:call',
    });
  });

  it('returns a text body as a string', async () => {
    await expect(local.run(step({ method: 'GET', url: `${base}/text` }), context)).resolves.toEqual(
      { status: 200, body: 'plain answer' },
    );
  });

  it('keeps a body declared as JSON that does not parse as text', async () => {
    await expect(
      local.run(step({ method: 'GET', url: `${base}/badjson` }), context),
    ).resolves.toEqual({ status: 200, body: '{not json' });
  });

  it('resolves host names when the policy allows the address', async () => {
    const port = new URL(base).port;

    await expect(
      local.run(step({ method: 'GET', url: `http://localhost:${port}/text` }), context),
    ).resolves.toMatchObject({ status: 200 });
  });

  it('fails permanently on a host name that does not resolve', async () => {
    const error = await failure(
      local.run(step({ method: 'GET', url: 'http://operantix-missing.invalid/' }), context),
    );

    expect(error).toMatchObject({ code: 'HTTP_CONNECTION_FAILED', retryable: false });
  });

  it('truncates a response larger than the limit', async () => {
    const output = await local.run(step({ method: 'GET', url: `${base}/big` }), context);

    expect(output).toMatchObject({ status: 200, truncated: true });
    expect((output as { body: string }).body).toHaveLength(1_000);
  });

  it('fails permanently on a client error, without the response body in the message', async () => {
    const error = await failure(
      local.run(step({ method: 'GET', url: `${base}/missing` }), context),
    );

    expect(error).toMatchObject({ code: 'HTTP_STATUS', retryable: false });
    expect(error.message).toContain('404');
    expect(error.message).not.toContain('nope');
  });

  it.each(['/busy', '/throttled'])('marks %s as retryable', async (path) => {
    const error = await failure(local.run(step({ method: 'GET', url: `${base}${path}` }), context));

    expect(error).toMatchObject({ code: 'HTTP_STATUS', retryable: true });
  });

  it('does not follow redirects', async () => {
    const error = await failure(local.run(step({ method: 'GET', url: `${base}/moved` }), context));

    expect(error).toMatchObject({ code: 'HTTP_REDIRECT_NOT_FOLLOWED', retryable: false });
  });

  it('times out as a retryable failure', async () => {
    const error = await failure(local.run(step({ method: 'GET', url: `${base}/slow` }), context));

    expect(error).toMatchObject({ code: 'HTTP_TIMEOUT', retryable: true });
  });

  it('treats a refused connection as retryable', async () => {
    const error = await failure(
      local.run(step({ method: 'GET', url: 'http://127.0.0.1:1/' }), context),
    );

    expect(error).toMatchObject({ code: 'HTTP_CONNECTION_FAILED', retryable: true });
  });

  describe('destination policy', () => {
    it.each([
      'http://127.0.0.1:1/',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/',
      'http://localhost/',
    ])('refuses %s before connecting', async (url) => {
      const error = await failure(strict.run(step({ method: 'GET', url }), context));

      expect(error).toMatchObject({ code: 'DESTINATION_BLOCKED', retryable: false });
    });

    it('refuses a private destination even when the server is up', async () => {
      const before = received.length;

      await failure(strict.run(step({ method: 'GET', url: `${base}/ok` }), context));

      expect(received).toHaveLength(before);
    });
  });

  it('rejects a config that is not an http_request config', async () => {
    const error = await failure(local.run(step({ method: 'GET', url: 'ftp://x' }), context));

    expect(error).toMatchObject({ code: 'INVALID_STEP_CONFIG', retryable: false });
  });
});
