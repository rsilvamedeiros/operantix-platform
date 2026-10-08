/**
 * A step failure the runner can classify. Retryable failures (timeouts, 5xx, 429) are tried
 * again with backoff; permanent ones fail the execution at once.
 */
export class StepError extends Error {
  override name = 'StepError';

  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
