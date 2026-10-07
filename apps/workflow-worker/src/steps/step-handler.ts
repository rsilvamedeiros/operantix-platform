import type { WorkflowStep } from '../engine.schema';

export interface StepContext {
  organizationId: string;
  executionId: string;
  input: Record<string, unknown>;
}

/** Runs one step type. The returned value is stored as the step output. */
export interface StepHandler {
  readonly type: string;
  run(step: WorkflowStep, context: StepContext): Promise<unknown>;
}
