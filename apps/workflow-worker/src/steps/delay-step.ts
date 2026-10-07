import type { WorkflowStep } from '../engine.schema';
import type { StepContext, StepHandler } from './step-handler';

/** `delay` step: waits without holding a worker or a lease. */
export class DelayStep implements StepHandler {
  readonly type = 'delay';

  constructor(private readonly now: () => Date = () => new Date()) {}

  run(_step: WorkflowStep, _context: StepContext): Promise<unknown> {
    throw new Error('not implemented');
  }
}
