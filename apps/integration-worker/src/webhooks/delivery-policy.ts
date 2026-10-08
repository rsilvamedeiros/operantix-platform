export interface DeliveryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}
export type AttemptResult =
  { kind: 'response'; status: number } | { kind: 'error'; code: string; retryable: boolean };
export type DeliveryOutcome =
  | { status: 'SUCCEEDED' }
  | { status: 'PENDING'; nextAttemptAt: Date; errorCode: string }
  | { status: 'FAILED'; errorCode: string };
export function decideOutcome(
  _result: AttemptResult,
  _attempt: number,
  _policy: DeliveryPolicy,
  _now: Date,
): DeliveryOutcome {
  throw new Error('not implemented');
}
