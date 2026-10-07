import { describe, expect, it } from 'vitest';
import { evaluateReadiness, type ReadinessCheck } from './readiness';

const up = (name: string): ReadinessCheck => ({ name, check: () => Promise.resolve() });
const down = (name: string): ReadinessCheck => ({
  name,
  check: () => Promise.reject(new Error('connection refused')),
});
const hanging = (name: string): ReadinessCheck => ({
  name,
  check: () => new Promise<void>(() => undefined),
});

describe('evaluateReadiness', () => {
  it('reports ok when every dependency is up', async () => {
    const report = await evaluateReadiness([up('postgres'), up('redis')], 100);

    expect(report).toEqual({ status: 'ok', checks: { postgres: 'up', redis: 'up' } });
  });

  it('reports error and marks the failing dependency down', async () => {
    const report = await evaluateReadiness([up('postgres'), down('redis')], 100);

    expect(report).toEqual({ status: 'error', checks: { postgres: 'up', redis: 'down' } });
  });

  it('marks a dependency down when its check exceeds the timeout', async () => {
    const report = await evaluateReadiness([hanging('postgres'), up('redis')], 20);

    expect(report).toEqual({ status: 'error', checks: { postgres: 'down', redis: 'up' } });
  });

  it('reports ok when there are no dependencies to check', async () => {
    const report = await evaluateReadiness([], 100);

    expect(report).toEqual({ status: 'ok', checks: {} });
  });
});
