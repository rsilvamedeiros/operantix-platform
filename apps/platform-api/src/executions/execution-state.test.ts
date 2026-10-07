import { describe, expect, it } from 'vitest';
import {
  type ExecutionStatus,
  IllegalTransitionError,
  isTerminal,
  nextExecutionStatus,
} from './execution-state';

describe('execution state machine', () => {
  it.each([
    ['PENDING', 'start', 'RUNNING'],
    ['PENDING', 'cancel', 'CANCELLED'],
    ['RUNNING', 'succeed', 'SUCCEEDED'],
    ['RUNNING', 'fail', 'FAILED'],
    ['RUNNING', 'cancel', 'CANCELLED'],
  ] as const)('moves %s on %s to %s', (from, event, to) => {
    expect(nextExecutionStatus(from, event)).toBe(to);
  });

  it.each([
    ['PENDING', 'succeed'],
    ['PENDING', 'fail'],
    ['RUNNING', 'start'],
    ['SUCCEEDED', 'start'],
    ['FAILED', 'cancel'],
    ['CANCELLED', 'start'],
  ] as const)('refuses %s on %s', (from, event) => {
    expect(() => nextExecutionStatus(from, event)).toThrow(IllegalTransitionError);
  });

  it('knows which states are final', () => {
    const terminal: ExecutionStatus[] = ['SUCCEEDED', 'FAILED', 'CANCELLED'];

    expect(terminal.every(isTerminal)).toBe(true);
    expect(isTerminal('PENDING')).toBe(false);
    expect(isTerminal('RUNNING')).toBe(false);
  });
});
