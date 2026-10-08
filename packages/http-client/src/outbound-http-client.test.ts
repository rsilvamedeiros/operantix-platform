import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  guardedLookup,
  isRetryableStatus,
  OutboundHttpClient,
  OutboundHttpError,
  type OutboundRequest,
} from './outbound-http-client';

describe('OutboundHttpClient', () => {
  let server: Server;
  let base: string;
  const bodies: string[] = [];
  const routes: Record<string, (res: ServerResponse) => void> = {
    '/json': (res) => {
      res.setHeader('content-type', 'application/problem+json');
      res.end('{"ok":true}');
    },
    '/big': (res) => res.end('x'.repeat(5_000)),
    '/moved': (res) => {
      res.statusCode = 302;
      res.setHeader('location', 'http://169.254.169.254/');
      res.end();
    },
    '/slow': () => {
      // Never answers; the timeout must fire.
    },
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        bodies.push(body);
        const route = routes[req.url ?? ''];
        if (route) route(res);
        else res.end('plain');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const options = { timeoutMs: 300, maxResponseBytes: 1_000 };
  const local = new OutboundHttpClient({ ...options, allowPrivateNetworks: true });
  const strict = new OutboundHttpClient({ ...options, allowPrivateNetworks: false });
  const get = (url: string): OutboundRequest => ({ method: 'GET', url: new URL(url), headers: {} });
  const failure = async (promise: Promise<unknown>) => {
    const error: unknown = await promise.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(OutboundHttpError);
    return error as OutboundHttpError;
  };

  it('sends the body with its length and reads a JSON response', async () => {
    const response = await local.send({
      method: 'POST',
      url: new URL(`${base}/json`),
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    });

    expect(response).toEqual({ status: 200, text: '{"ok":true}', json: true, truncated: false });
    expect(bodies.at(-1)).toBe('{"a":1}');
  });

  it('truncates a response larger than the limit', async () => {
    const response = await local.send(get(`${base}/big`));

    expect(response).toMatchObject({ truncated: true, json: false });
    expect(response.text).toHaveLength(1_000);
  });

  it('returns a redirect instead of following it', async () => {
    await expect(local.send(get(`${base}/moved`))).resolves.toMatchObject({ status: 302 });
  });

  it('resolves host names when the policy allows the address', async () => {
    const port = new URL(base).port;

    await expect(local.send(get(`http://localhost:${port}/`))).resolves.toMatchObject({
      status: 200,
      text: 'plain',
    });
  });

  it('times out as a retryable failure', async () => {
    const error = await failure(local.send(get(`${base}/slow`)));

    expect(error).toMatchObject({ code: 'HTTP_TIMEOUT', retryable: true });
  });

  it('treats a refused connection as retryable', async () => {
    const error = await failure(local.send(get('http://127.0.0.1:1/')));

    expect(error).toMatchObject({ code: 'HTTP_CONNECTION_FAILED', retryable: true });
  });

  it('fails permanently on a host name that does not resolve', async () => {
    const error = await failure(local.send(get('http://operantix-missing.invalid/')));

    expect(error).toMatchObject({ code: 'HTTP_CONNECTION_FAILED', retryable: false });
  });

  it.each(['http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://localhost/'])(
    'refuses %s before connecting',
    async (url) => {
      const error = await failure(strict.send(get(url)));

      expect(error).toMatchObject({ code: 'DESTINATION_BLOCKED', retryable: false });
    },
  );
});

describe('isRetryableStatus', () => {
  it.each([
    [408, true],
    [429, true],
    [503, true],
    [400, false],
    [404, false],
    [501, false],
  ])('%i: %s', (status, retryable) => {
    expect(isRetryableStatus(status)).toBe(retryable);
  });
});

describe('guardedLookup', () => {
  const resolve = (all: boolean, blocked: boolean) =>
    new Promise<{ error: unknown; address: unknown; family: unknown }>((done) => {
      guardedLookup(() => blocked)('localhost', { all }, (error, address, family) => {
        done({ error, address, family });
      });
    });

  it('answers with a single address when one is asked for', async () => {
    const { error, address, family } = await resolve(false, false);

    expect(error).toBeNull();
    expect(typeof address).toBe('string');
    expect([4, 6]).toContain(family);
  });

  it('answers with every address when all are asked for', async () => {
    const { address } = await resolve(true, false);

    expect(Array.isArray(address)).toBe(true);
  });

  it('refuses when a resolved address is blocked', async () => {
    const { error } = await resolve(false, true);

    expect(error).toMatchObject({ code: 'DESTINATION_BLOCKED' });
  });

  it('passes resolution errors through', async () => {
    const error = await new Promise((done) => {
      guardedLookup(() => false)('operantix-missing.invalid', {}, (e) => {
        done(e);
      });
    });

    expect(error).toMatchObject({ code: 'ENOTFOUND' });
  });
});
