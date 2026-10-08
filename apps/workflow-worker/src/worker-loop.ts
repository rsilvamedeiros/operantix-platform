import { Logger } from '@nestjs/common';
import { PollingLoop, type PollingLoopOptions } from '@operantix/messaging';
import type { ExecutionOutcome } from './execution/execution-runner';
import type { ClaimedJob } from './queue/job-queue';

export interface JobSource {
  claim(limit: number): Promise<ClaimedJob[]>;
  complete(jobId: string): Promise<void>;
}

export interface JobRunner {
  run(job: ClaimedJob): Promise<ExecutionOutcome>;
}

export type WorkerLoopOptions = PollingLoopOptions;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Polls the queue and runs claimed jobs one at a time. A job is completed only after its run
 * returns; when the run throws, the lease is left to expire and another claim retries it.
 */
export class WorkerLoop {
  private readonly logger = new Logger(WorkerLoop.name);
  private readonly polling: PollingLoop;

  constructor(
    private readonly queue: JobSource,
    private readonly runner: JobRunner,
    private readonly options: WorkerLoopOptions,
  ) {
    this.polling = new PollingLoop(
      () => this.tick(),
      options,
      (error) => {
        this.logger.error({ msg: `Tick failed: ${message(error)}` });
      },
    );
  }

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
    this.polling.start();
  }

  /** Stops polling and waits for the batch in flight. */
  async stop(): Promise<void> {
    await this.polling.stop();
  }
}
