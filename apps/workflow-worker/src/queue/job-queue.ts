import type { Database } from '../database';

export interface ClaimedJob {
  id: string;
  organizationId: string;
  executionId: string;
  /** Claims so far, this one included. */
  attempts: number;
  maxAttempts: number;
}

export interface JobQueueOptions {
  workerId: string;
  leaseSeconds: number;
}

/** The execution_jobs queue (ADR-0018). */
export class JobQueue {
  constructor(
    private readonly db: Database,
    private readonly options: JobQueueOptions,
  ) {}

  /** Leases up to `limit` due jobs that no live lease holds. */
  claim(_limit: number): Promise<ClaimedJob[]> {
    throw new Error('not implemented');
  }

  /** Removes a job whose execution reached a terminal state. */
  complete(_jobId: string): Promise<void> {
    throw new Error('not implemented');
  }
}
