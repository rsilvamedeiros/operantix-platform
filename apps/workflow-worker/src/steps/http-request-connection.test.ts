import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkflowStep } from '../engine.schema';
import type { ConnectionResolver, ResolvedConnection } from './connection-resolver';
import { HttpRequestStep } from './http-request-step';
import { StepError } from './step-error';

const CONNECTION_ID = '3f2c1b0a-9e8d-4c7b-8a6f-5e4d3c2b1a09';
const context = {
  organizationId: 'org-1',
  executionId: 'exec-1',
  input: {},
  stepStartedAt: new Date(),
};

describe('HttpRequestStep with a connection', () => {
  let server: Server;
  let base: string;
  const received: IncomingMessage['headers'][] = [];
  let connection: ResolvedConnection | undefined;
  const lookups: [string, string][] = [];
  const resolver: ConnectionResolver = {
    resolve: (organizationId, connectionId) => {
      lookups.push([organizationId, connectionId]);
      return Promise.resolve(connection);
    },
  };

  beforeAll(async () => {
    server = createServer((req, res) => {
      received.push(req.headers);
      res.end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  const http = new HttpRequestStep(
    { timeoutMs: 300, allowPrivateNetworks: true, maxResponseBytes: 1_000 },
    resolver,
  );
  const step = (url: string, headers?: Record<string, string>): WorkflowStep => ({
    id: 'call',
    name: 'Call',
    type: 'http_request',
    config: { method: 'GET', url, connectionId: CONNECTION_ID, ...(headers ? { headers } : {}) },
  });
  const failure = async (promise: Promise<unknown>) => {
    const error: unknown = await promise.then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(StepError);
    return error as StepError;
  };

  it("sends a bearer credential, looked up in the execution's organization", async () => {
    connection = { baseUrl: `${base}/api`, header: { name: 'authorization', value: 'Bearer t-1' } };

    await http.run(step(`${base}/api/leads`), context);

    expect(lookups.at(-1)).toEqual(['org-1', CONNECTION_ID]);
    expect(received.at(-1)?.authorization).toBe('Bearer t-1');
  });

  it('sends a custom header credential over a header of the same name in the step', async () => {
    connection = { baseUrl: base, header: { name: 'x-api-key', value: 'k-1' } };

    await http.run(step(`${base}/x`, { 'X-Api-Key': 'from-definition' }), context);

    expect(received.at(-1)?.['x-api-key']).toBe('k-1');
  });

  it('refuses a URL outside the base URL without calling it', async () => {
    connection = { baseUrl: `${base}/api`, header: { name: 'authorization', value: 'Bearer t-1' } };
    const before = received.length;

    const error = await failure(http.run(step(`${base}/admin`), context));

    expect(error).toMatchObject({ code: 'CONNECTION_URL_MISMATCH', retryable: false });
    expect(error.message).not.toContain('t-1');
    expect(received.length).toBe(before);
  });

  it('fails permanently when the connection does not exist', async () => {
    connection = undefined;

    const error = await failure(http.run(step(`${base}/x`), context));

    expect(error).toMatchObject({ code: 'CONNECTION_NOT_FOUND', retryable: false });
  });

  it('fails permanently when the credential cannot be decrypted', async () => {
    const failing = new HttpRequestStep(
      { timeoutMs: 300, allowPrivateNetworks: true, maxResponseBytes: 1_000 },
      {
        resolve: () =>
          Promise.reject(new Error('Unsupported state or unable to authenticate data')),
      },
    );

    const error = await failure(failing.run(step(`${base}/x`), context));

    expect(error).toMatchObject({ code: 'CONNECTION_UNAVAILABLE', retryable: false });
  });

  it('refuses a connection when the worker has no resolver', async () => {
    const plain = new HttpRequestStep({
      timeoutMs: 300,
      allowPrivateNetworks: true,
      maxResponseBytes: 1_000,
    });

    const error = await failure(plain.run(step(`${base}/x`), context));

    expect(error).toMatchObject({ code: 'CONNECTION_UNAVAILABLE', retryable: false });
  });
});
