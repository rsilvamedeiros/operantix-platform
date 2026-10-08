import { z } from 'zod';
import type { WorkflowStep } from '../engine.schema';
import { StepError } from './step-error';
import { type StepContext, type StepHandler, StepSuspended } from './step-handler';

const configSchema = z.object({ seconds: z.int().min(1).max(86_400) });

/**
 * `delay` step: waits without holding a worker or a lease. Until the delay has passed since
 * the step first started, it suspends; the runner parks it and wakes the job at `resumeAt`.
 */
export class DelayStep implements StepHandler {
  readonly type = 'delay';

  constructor(private readonly now: () => Date = () => new Date()) {}

  run(step: WorkflowStep, context: StepContext): Promise<unknown> {
    const parsed = configSchema.safeParse(step.config);
    if (!parsed.success) {
      return Promise.reject(new StepError('INVALID_STEP_CONFIG', 'Invalid delay config', false));
    }
    const { seconds } = parsed.data;
    const resumeAt = new Date(context.stepStartedAt.getTime() + seconds * 1000);
    if (resumeAt > this.now()) return Promise.reject(new StepSuspended(resumeAt));
    return Promise.resolve({ waitedSeconds: seconds });
  }
}
