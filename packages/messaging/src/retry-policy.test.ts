import { describe, expect, it } from 'vitest';
import { errorCode, PermanentError, routeFailure } from './retry-policy';

const policy = { maxAttempts: 4, baseDelayMs: 1_000, maxDelayMs: 5_000 };
const now = new Date('2026-10-08T12:00:00.000Z');
const after = (ms: number) => new Date(now.getTime() + ms);

describe('routeFailure', () => {
  it('retries an unclassified failure later, doubling the delay each attempt', () => {
    expect(routeFailure(new Error('db down'), 1, policy, now)).toEqual({
      kind: 'retry',
      attempt: 2,
      notBefore: after(1_000),
    });
    expect(routeFailure(new Error('db down'), 2, policy, now)).toEqual({
      kind: 'retry',
      attempt: 3,
      notBefore: after(2_000),
    });
    expect(routeFailure(new Error('db down'), 3, policy, now)).toEqual({
      kind: 'retry',
      attempt: 4,
      notBefore: after(4_000),
    });
  });

  it('caps the delay', () => {
    expect(routeFailure(new Error('x'), 4, { ...policy, maxAttempts: 10 }, now)).toMatchObject({
      notBefore: after(5_000),
    });
  });

  it('dead-letters once the attempts run out', () => {
    expect(routeFailure(new Error('db down'), 4, policy, now)).toEqual({
      kind: 'dead-letter',
      reason: 'RETRIES_EXHAUSTED',
    });
  });

  it('dead-letters a permanent failure at once', () => {
    expect(routeFailure(new PermanentError('UNKNOWN_WORKFLOW'), 1, policy, now)).toEqual({
      kind: 'dead-letter',
      reason: 'HANDLER_REJECTED',
    });
  });
});

describe('errorCode', () => {
  it('prefers the error code, then the error name', () => {
    expect(errorCode(new PermanentError('UNKNOWN_WORKFLOW'))).toBe('UNKNOWN_WORKFLOW');
    expect(errorCode(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))).toBe(
      'ECONNREFUSED',
    );
    expect(errorCode(new TypeError('boom'))).toBe('TypeError');
    expect(errorCode('thrown string')).toBe('UNKNOWN');
  });

  it('never carries the message, which may hold event data', () => {
    expect(errorCode(new Error('customer jane@example.com'))).toBe('Error');
  });
});
