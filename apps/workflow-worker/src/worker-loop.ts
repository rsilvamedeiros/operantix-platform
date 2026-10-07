import type { ClaimedJob } from './queue/job-queue';
import type { ExecutionOutcome } from './execution/execution-runner';

export interface JobSource {
  claim(limit: number): Promise<ClaimedJob[]>;
  complete(jobId: string): Promise<void>;
}

export interface JobRunner {
  run(job: ClaimedJob): Promise<ExecutionOutcome>;
}

export interface WorkerLoopOptions {
  batchSize: number;
  pollIntervalMs: number;
}

/** Polls the queue and runs claimed jobs. */
export class WorkerLoop {
  constructor(
    private readonly queue: JobSource,
    private readonly runner: JobRunner,
    private readonly options: WorkerLoopOptions,
  ) {}

  /** Claims one batch and runs it; returns how many jobs were claimed. */
  tick(): Promise<number> {
    throw new Error('not implemented');
  }

  start(): void {
    throw new Error('not implemented');
  }

  stop(): Promise<void> {
    throw new Error('not implemented');
  }
}
