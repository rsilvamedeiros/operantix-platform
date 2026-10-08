import { isRetryableStatus } from '@operantix/http-client';

export interface DeliveryPolicy {
  /** Attempts in total, the first one included. */
  maxAttempts: number;
  /** Delay before the second attempt; it doubles for each later one. */
  baseDelayMs: number;
  maxDelayMs: number;
}

/** What one attempt produced: a response, or an error before any response. */
export type AttemptResult =
  { kind: 'response'; status: number } | { kind: 'error'; code: string; retryable: boolean };

export type DeliveryOutcome =
  | { status: 'SUCCEEDED' }
  | { status: 'PENDING'; nextAttemptAt: Date; errorCode: string }
  | { status: 'FAILED'; errorCode: string };

/** Where a delivery goes after attempt number `attempt` (1-based). */
export function decideOutcome(
  result: AttemptResult,
  attempt: number,
  policy: DeliveryPolicy,
  now: Date,
): DeliveryOutcome {
  let errorCode: string;
  let retryable: boolean;
  if (result.kind === 'error') {
    errorCode = result.code;
    retryable = result.retryable;
  } else if (result.status >= 200 && result.status < 300) {
    return { status: 'SUCCEEDED' };
  } else if (result.status >= 300 && result.status < 400) {
    // A redirect could point anywhere, including past the SSRF policy: never followed.
    errorCode = 'HTTP_REDIRECT_NOT_FOLLOWED';
    retryable = false;
  } else {
    errorCode = 'HTTP_STATUS';
    retryable = isRetryableStatus(result.status);
  }
  if (!retryable || attempt >= policy.maxAttempts) return { status: 'FAILED', errorCode };
  const delayMs = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
  return { status: 'PENDING', nextAttemptAt: new Date(now.getTime() + delayMs), errorCode };
}
