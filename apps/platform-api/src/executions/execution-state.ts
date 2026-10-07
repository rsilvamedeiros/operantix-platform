export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type ExecutionEvent = 'start' | 'succeed' | 'fail' | 'cancel';

export class IllegalTransitionError extends Error {
  override name = 'IllegalTransitionError';
}

export function nextExecutionStatus(
  _from: ExecutionStatus,
  _event: ExecutionEvent,
): ExecutionStatus {
  throw new IllegalTransitionError('Not implemented');
}

export function isTerminal(_status: ExecutionStatus): boolean {
  return false;
}
