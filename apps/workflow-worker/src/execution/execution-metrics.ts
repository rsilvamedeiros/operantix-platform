import { meter } from '@operantix/telemetry';

// Step types come from workflow definitions; anything that does not look like a registered type
// name is folded into one value so the label stays bounded.
const STEP_TYPE = /^[a-z][a-z0-9_]{0,31}$/;

/** One run of an execution ended: terminal, or rescheduled after a delay or retry. */
export function recordRun(outcome: string): void {
  meter()
    .createCounter('operantix.execution.runs', {
      description: 'Runs of an execution by the worker, by outcome',
    })
    .add(1, { outcome });
}

/** A step attempt finished, whether it succeeded, failed or parked itself. */
export function recordStep(
  stepType: string,
  outcome: 'success' | 'failure' | 'suspended',
  durationMs: number,
): void {
  meter()
    .createHistogram('operantix.step.duration', {
      description: 'Duration of one step attempt',
      unit: 'ms',
    })
    .record(durationMs, {
      'step.type': STEP_TYPE.test(stepType) ? stepType : 'other',
      outcome,
    });
}
