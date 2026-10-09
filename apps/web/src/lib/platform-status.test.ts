import { describe, expect, it, vi } from 'vitest';
import { fetchPlatformStatus } from './platform-status';

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(() =>
    Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    ),
  );
}

const baseUrl = 'http://api.test';

describe('fetchPlatformStatus', () => {
  it('asks the readiness endpoint without caching', async () => {
    const fetchImpl = respond(200, { status: 'ok', checks: { postgres: 'up', redis: 'up' } });

    await fetchPlatformStatus({ baseUrl, fetch: fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/health/ready',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) as unknown }),
    );
  });

  it('reports up with every dependency when the API is ready', async () => {
    const fetchImpl = respond(200, { status: 'ok', checks: { postgres: 'up', redis: 'up' } });

    await expect(fetchPlatformStatus({ baseUrl, fetch: fetchImpl })).resolves.toEqual({
      state: 'up',
      checks: { postgres: 'up', redis: 'up' },
    });
  });

  it('reports degraded with the failing dependency when the API answers 503', async () => {
    const fetchImpl = respond(503, { status: 'error', checks: { postgres: 'up', redis: 'down' } });

    await expect(fetchPlatformStatus({ baseUrl, fetch: fetchImpl })).resolves.toEqual({
      state: 'degraded',
      checks: { postgres: 'up', redis: 'down' },
    });
  });

  it.each([
    ['a network error', vi.fn(() => Promise.reject(new Error('ECONNREFUSED')))],
    ['a timeout', vi.fn(() => Promise.reject(new DOMException('timed out', 'TimeoutError')))],
    ['a body that is not JSON', respond(200, 'not json')],
    ['an unexpected status', respond(500, { message: 'boom' })],
    ['a body without checks', respond(200, { status: 'ok' })],
    ['an unknown check state', respond(200, { checks: { postgres: 'maybe' } })],
  ])('reports unreachable on %s', async (_name, fetchImpl) => {
    await expect(
      fetchPlatformStatus({ baseUrl, fetch: fetchImpl as unknown as typeof fetch }),
    ).resolves.toEqual({ state: 'unreachable' });
  });
});
