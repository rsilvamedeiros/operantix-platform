import type { WorkflowStep } from '../engine.schema';
import type { StepContext, StepHandler } from './step-handler';

export class UnsupportedStepError extends Error {
  override name = 'UnsupportedStepError';
}

/** Routes a step to the handler of its type. */
export class StepDispatcher {
  constructor(private readonly handlers: StepHandler[]) {}

  dispatch(_step: WorkflowStep, _context: StepContext): Promise<unknown> {
    throw new Error('not implemented');
  }
}
