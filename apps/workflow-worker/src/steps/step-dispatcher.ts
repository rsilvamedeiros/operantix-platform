import type { WorkflowStep } from '../engine.schema';
import type { StepContext, StepHandler } from './step-handler';

export class UnsupportedStepError extends Error {
  override name = 'UnsupportedStepError';
}

/** Routes a step to the handler of its type. */
export class StepDispatcher {
  private readonly handlers = new Map<string, StepHandler>();

  constructor(handlers: StepHandler[]) {
    for (const handler of handlers) {
      if (this.handlers.has(handler.type)) {
        throw new Error(`Two handlers for step type "${handler.type}"`);
      }
      this.handlers.set(handler.type, handler);
    }
  }

  dispatch(step: WorkflowStep, context: StepContext): Promise<unknown> {
    const handler = this.handlers.get(step.type);
    if (!handler) {
      return Promise.reject(
        new UnsupportedStepError(`Step type "${step.type}" is not supported by this worker`),
      );
    }
    return handler.run(step, context);
  }
}
