import { Logger } from '@nestjs/common';
import type { ExecutionOutcome } from './execution/execution-runner';
import type { ClaimedJob } from './queue/job-queue';

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

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Polls the queue and runs claimed jobs one at a time. A job is completed only after its run
 * returns; when the run throws, the lease is left to expire and another claim retries it.
 */
export class WorkerLoop {
  private readonly logger = new Logger(WorkerLoop.name);
  private running = false;
  private current: Promise<void> | undefined;
  private wake: (() => void) | undefined;

  constructor(
    private readonly queue: JobSource,
    private readonly runner: JobRunner,
    private readonly options: WorkerLoopOptions,
  ) {}

  /** Claims one batch and runs it; returns how many jobs were claimed. */
  async tick(): Promise<number> {
    const jobs = await this.queue.claim(this.options.batchSize);
    for (const job of jobs) {
      const scope = {
        jobId: job.id,
        executionId: job.executionId,
        organizationId: job.organizationId,
      };
      try {
        const outcome = await this.runner.run(job);
        // A rescheduled job stays queued with its new run_after.
        if (outcome !== 'RESCHEDULED') await this.queue.complete(job.id);
        this.logger.log({ ...scope, outcome, msg: 'Job completed' });
      } catch (error) {
        this.logger.error({
          ...scope,
          attempts: job.attempts,
          msg: `Job failed: ${message(error)}`,
        });
      }
    }
    return jobs.length;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.current = this.poll();
  }

  /** Stops polling and waits for the batch in flight. */
  async stop(): Promise<void> {
    this.running = false;
    this.wake?.();
    await this.current;
  }

  private async poll(): Promise<void> {
    while (this.running) {
      let claimed = 0;
      try {
        claimed = await this.tick();
      } catch (error) {
        this.logger.error({ msg: `Claim failed: ${message(error)}` });
      }
      // A full batch suggests more work is waiting; otherwise sleep until the next poll.
      if (claimed < this.options.batchSize && this.isRunning()) await this.sleep();
    }
  }

  /** Read through a method: stop() flips the flag while poll() awaits, which narrowing misses. */
  private isRunning(): boolean {
    return this.running;
  }

  private sleep(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, this.options.pollIntervalMs);
      this.wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}
