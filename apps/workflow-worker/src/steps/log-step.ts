import type { WorkflowStep } from '../engine.schema';
import type { StepHandler } from './step-handler';

/** `log` step: records its message as the step output. */
export class LogStep implements StepHandler {
  readonly type = 'log';

  run(step: WorkflowStep): Promise<unknown> {
    return Promise.resolve({ message: step.config['message'] });
  }
}
