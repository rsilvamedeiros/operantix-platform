import type { Database } from '../database';
import type { ClaimedJob } from '../queue/job-queue';
import type { StepDispatcher } from '../steps/step-dispatcher';

export type ExecutionOutcome = 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

/** Drives one execution to a terminal state, one committed step at a time. */
export class ExecutionRunner {
  constructor(
    private readonly db: Database,
    private readonly dispatcher: StepDispatcher,
  ) {}

  run(_job: ClaimedJob): Promise<ExecutionOutcome> {
    throw new Error('not implemented');
  }
}
