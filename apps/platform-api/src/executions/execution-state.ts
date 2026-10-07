export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type ExecutionEvent = 'start' | 'succeed' | 'fail' | 'cancel';

export class IllegalTransitionError extends Error {
  override name = 'IllegalTransitionError';
}

// Allowed transitions; anything absent is illegal. Terminal states have no way out.
const TRANSITIONS: Record<ExecutionStatus, Partial<Record<ExecutionEvent, ExecutionStatus>>> = {
  PENDING: { start: 'RUNNING', cancel: 'CANCELLED' },
  RUNNING: { succeed: 'SUCCEEDED', fail: 'FAILED', cancel: 'CANCELLED' },
  SUCCEEDED: {},
  FAILED: {},
  CANCELLED: {},
};

export function nextExecutionStatus(from: ExecutionStatus, event: ExecutionEvent): ExecutionStatus {
  const to = TRANSITIONS[from][event];
  if (!to) throw new IllegalTransitionError(`Cannot ${event} an execution that is ${from}`);
  return to;
}

export function isTerminal(status: ExecutionStatus): boolean {
  return Object.keys(TRANSITIONS[status]).length === 0;
}
