import type { WorkflowStep } from '../engine.schema';

export interface StepContext {
  organizationId: string;
  executionId: string;
  input: Record<string, unknown>;
  /** When this step first started; kept across retries and suspensions. */
  stepStartedAt: Date;
}

/**
 * Thrown by a handler that has to wait: the runner parks the step as WAITING and makes the
 * job due again at `resumeAt`, releasing the worker in the meantime.
 */
export class StepSuspended extends Error {
  override name = 'StepSuspended';

  constructor(readonly resumeAt: Date) {
    super(`Suspended until ${resumeAt.toISOString()}`);
  }
}

/** Runs one step type. The returned value is stored as the step output. */
export interface StepHandler {
  readonly type: string;
  run(step: WorkflowStep, context: StepContext): Promise<unknown>;
}
