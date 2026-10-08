import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AiServiceClient, AiServiceError, type ClassifyTextRequest } from './ai-service-client';

// Generated per run so no credential-like literal lives in the repo.
const TOKEN = randomBytes(32).toString('base64url');
const ORG = '0b9f6c1e-3d4a-4f7b-9a51-2c8e7d6f5a43';
const REQUEST: ClassifyTextRequest = {
  text: 'I was charged twice',
  labels: [{ name: 'billing', description: 'Charges' }, { name: 'sales' }],
  tenant: { organizationId: ORG },
};
const CLASSIFICATION = {
  label: 'billing',
  confidence: 0.9,
  promptVersion: 'classify-text@1',
  model: 'claude-opus-5-5',
  usage: { inputTokens: 120, outputTokens: 30, costUsd: 0.00108, latencyMs: 812 },
};

interface Received {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingMessage['headers'];
  body: string;
}

type Route = (res: ServerResponse) => void;

const json =
  (status: number, body: unknown): Route =>
  (res) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };

describe('AiServiceClient', () => {
  let server: Server;
  let base: string;
  let route: Route = json(200, CLASSIFICATION);
  const received: Received[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, headers: req.headers, body });
        route(res);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const client = (timeoutMs = 2_000) => new AiServiceClient({ url: base, token: TOKEN, timeoutMs });

  const failure = async (call: Promise<unknown>): Promise<AiServiceError> => {
    try {
      await call;
    } catch (error) {
      if (error instanceof AiServiceError) return error;
      throw error;
    }
    throw new Error('Expected the call to fail');
  };

  it('posts the request with the service token and returns the classification', async () => {
    route = json(200, CLASSIFICATION);
    received.length = 0;

    await expect(client().classify(REQUEST)).resolves.toEqual(CLASSIFICATION);

    const [request] = received;
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('/v1/classifications');
    expect(request?.headers['authorization']).toBe(`Bearer ${TOKEN}`);
    expect(request?.headers['content-type']).toBe('application/json');
    expect(JSON.parse(request?.body ?? '')).toEqual(REQUEST);
  });

  it('accepts a base URL with a trailing slash', async () => {
    route = json(200, CLASSIFICATION);
    received.length = 0;

    await new AiServiceClient({ url: `${base}/`, token: TOKEN, timeoutMs: 2_000 }).classify(
      REQUEST,
    );

    expect(received[0]?.url).toBe('/v1/classifications');
  });

  it('treats LLM_UNAVAILABLE as retryable', async () => {
    route = json(503, { code: 'LLM_UNAVAILABLE', message: 'down' });

    const error = await failure(client().classify(REQUEST));

    expect(error.code).toBe('LLM_UNAVAILABLE');
    expect(error.retryable).toBe(true);
  });

  it.each([
    [422, 'LLM_REFUSED'],
    [502, 'LLM_OUTPUT_INVALID'],
    [502, 'LLM_REJECTED'],
    [400, 'VALIDATION_FAILED'],
  ])('surfaces %i %s as a permanent failure', async (status, code) => {
    route = json(status, { code, message: 'x' });

    const error = await failure(client().classify(REQUEST));

    expect(error.code).toBe(code);
    expect(error.retryable).toBe(false);
  });

  it('reports a rejected service token as a configuration problem', async () => {
    route = json(401, { code: 'UNAUTHENTICATED', message: 'x' });

    const error = await failure(client().classify(REQUEST));

    expect(error.code).toBe('AI_SERVICE_UNAUTHORIZED');
    expect(error.retryable).toBe(false);
    expect(error.message).not.toContain(TOKEN);
  });

  it('retries a gateway error without the platform error shape', async () => {
    route = (res) => {
      res.statusCode = 502;
      res.end('<html>bad gateway</html>');
    };

    const error = await failure(client().classify(REQUEST));

    expect(error.code).toBe('AI_SERVICE_ERROR');
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain('bad gateway');
  });

  it('rejects a success response outside the contract', async () => {
    route = json(200, { ...CLASSIFICATION, confidence: 'high' });

    const error = await failure(client().classify(REQUEST));

    expect(error.code).toBe('AI_SERVICE_BAD_RESPONSE');
    expect(error.retryable).toBe(false);
  });

  it('times out a silent service as retryable', async () => {
    route = () => {
      // Never answers.
    };

    const error = await failure(client(100).classify(REQUEST));

    expect(error.code).toBe('AI_SERVICE_TIMEOUT');
    expect(error.retryable).toBe(true);
  });

  it('treats an unreachable service as retryable', async () => {
    const unreachable = new AiServiceClient({
      url: 'http://127.0.0.1:1',
      token: TOKEN,
      timeoutMs: 2_000,
    });

    const error = await failure(unreachable.classify(REQUEST));

    expect(error.code).toBe('AI_SERVICE_UNAVAILABLE');
    expect(error.retryable).toBe(true);
  });
});
