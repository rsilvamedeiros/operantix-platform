export interface RetryPolicy {
  /** Deliveries in total, the first one included. */
  maxAttempts: number;
  /** Delay before the second attempt; it doubles for each later one. */
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * A failure retrying cannot fix (the event is valid but refers to something that will never
 * exist, for example). The consumer dead-letters it at once instead of retrying.
 */
export class PermanentError extends Error {
  override name = 'PermanentError';

  constructor(readonly code: string) {
    super(code);
  }
}

export type DeadLetterReason = 'CONTRACT_VIOLATION' | 'HANDLER_REJECTED' | 'RETRIES_EXHAUSTED';

export type FailureRoute =
  | { kind: 'retry'; attempt: number; notBefore: Date }
  | { kind: 'dead-letter'; reason: DeadLetterReason };

/**
 * Where a handler failure goes (docs/events/retry-dlq.md). Unclassified errors are retried,
 * since a consumer's usual failure is a dependency that is briefly down.
 */
export function routeFailure(
  error: unknown,
  attempt: number,
  policy: RetryPolicy,
  now: Date,
): FailureRoute {
  if (error instanceof PermanentError) return { kind: 'dead-letter', reason: 'HANDLER_REJECTED' };
  if (attempt >= policy.maxAttempts) return { kind: 'dead-letter', reason: 'RETRIES_EXHAUSTED' };
  const delayMs = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
  return { kind: 'retry', attempt: attempt + 1, notBefore: new Date(now.getTime() + delayMs) };
}

/** A short, non-sensitive label for an error: its code, else its name. Never its message. */
export function errorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'UNKNOWN';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 ? code : error.name;
}
