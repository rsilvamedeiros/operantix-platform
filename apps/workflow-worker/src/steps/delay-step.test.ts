import { describe, expect, it } from 'vitest';
import type { WorkflowStep } from '../engine.schema';
import { DelayStep } from './delay-step';
import { StepError } from './step-error';
import { StepSuspended } from './step-handler';

const step = (config: Record<string, unknown>): WorkflowStep => ({
  id: 'wait',
  name: 'Wait',
  type: 'delay',
  config,
});
const context = (stepStartedAt: Date) => ({
  organizationId: 'org',
  executionId: 'exec',
  input: {},
  stepStartedAt,
});

describe('DelayStep', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  const delay = new DelayStep(() => now);

  it('suspends until the delay has passed since the step first started', async () => {
    const started = new Date('2026-10-07T11:59:50Z');

    const error: unknown = await delay.run(step({ seconds: 30 }), context(started)).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(StepSuspended);
    expect((error as StepSuspended).resumeAt).toEqual(new Date('2026-10-07T12:00:20Z'));
  });

  it('completes once the delay has passed', async () => {
    const started = new Date('2026-10-07T11:59:00Z');

    await expect(delay.run(step({ seconds: 30 }), context(started))).resolves.toEqual({
      waitedSeconds: 30,
    });
  });

  it('rejects an invalid config permanently', async () => {
    await expect(delay.run(step({ seconds: -1 }), context(now))).rejects.toMatchObject({
      code: 'INVALID_STEP_CONFIG',
      retryable: false,
    });
    await expect(delay.run(step({}), context(now))).rejects.toBeInstanceOf(StepError);
  });
});
