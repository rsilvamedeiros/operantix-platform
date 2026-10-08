import { describe, expect, it } from 'vitest';
import { decideOutcome } from './delivery-policy';

const policy = { maxAttempts: 4, baseDelayMs: 1_000, maxDelayMs: 5_000 };
const now = new Date('2026-10-08T12:00:00.000Z');
const at = (ms: number) => new Date(now.getTime() + ms);

describe('decideOutcome', () => {
  it.each([200, 202, 204, 299])('succeeds on %i', (status) => {
    expect(decideOutcome({ kind: 'response', status }, 1, policy, now)).toEqual({
      status: 'SUCCEEDED',
    });
  });

  it('retries a retryable status with exponential backoff, capped', () => {
    expect(decideOutcome({ kind: 'response', status: 503 }, 1, policy, now)).toEqual({
      status: 'PENDING',
      nextAttemptAt: at(1_000),
      errorCode: 'HTTP_STATUS',
    });
    expect(decideOutcome({ kind: 'response', status: 429 }, 3, policy, now)).toEqual({
      status: 'PENDING',
      nextAttemptAt: at(4_000),
      errorCode: 'HTTP_STATUS',
    });
  });

  it('retries a retryable network error', () => {
    expect(
      decideOutcome({ kind: 'error', code: 'HTTP_TIMEOUT', retryable: true }, 2, policy, now),
    ).toEqual({ status: 'PENDING', nextAttemptAt: at(2_000), errorCode: 'HTTP_TIMEOUT' });
  });

  it('caps the delay', () => {
    const big = { ...policy, maxAttempts: 10 };

    expect(decideOutcome({ kind: 'response', status: 500 }, 8, big, now)).toMatchObject({
      nextAttemptAt: at(5_000),
    });
  });

  it('fails once attempts run out', () => {
    expect(decideOutcome({ kind: 'response', status: 503 }, 4, policy, now)).toEqual({
      status: 'FAILED',
      errorCode: 'HTTP_STATUS',
    });
  });

  it.each([
    [{ kind: 'response', status: 400 } as const, 'HTTP_STATUS'],
    [{ kind: 'response', status: 410 } as const, 'HTTP_STATUS'],
    [{ kind: 'response', status: 302 } as const, 'HTTP_REDIRECT_NOT_FOLLOWED'],
    [
      { kind: 'error', code: 'DESTINATION_BLOCKED', retryable: false } as const,
      'DESTINATION_BLOCKED',
    ],
  ])('fails at once on %o', (result, errorCode) => {
    expect(decideOutcome(result, 1, policy, now)).toEqual({ status: 'FAILED', errorCode });
  });
});
