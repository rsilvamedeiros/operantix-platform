import { Logger } from '@nestjs/common';
import { PollingLoop, type PollingLoopOptions } from '@operantix/messaging';
import type { ExecutionOutcome } from './execution/execution-runner';
import type { ClaimedJob } from './queue/job-queue';

export interface JobSource {
  claim(limit: number): Promise<ClaimedJob[]>;
  complete(jobId: string): Promise<void>;
  /** Renews the leases of `jobIds` and returns those this worker still holds. */
  extend(jobIds: string[]): Promise<string[]>;
}

export interface JobRunner {
  run(job: ClaimedJob): Promise<ExecutionOutcome>;
}

export interface WorkerLoopOptions extends PollingLoopOptions {
  /** How often the leases of a running batch are renewed; well under the lease duration. */
  leaseHeartbeatMs: number;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Polls the queue and runs claimed jobs one at a time. A job is completed only after its run
 * returns; when the run throws, the lease is left to expire and another claim retries it.
 *
 * A batch is leased when it is claimed but runs sequentially, so a later job's lease could lapse
 * before its turn and another worker would run it too. While a batch is in flight its unfinished
 * leases are renewed on a timer and re-checked before each job; a job this worker no longer
 * holds is skipped.
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
    if (jobs.length === 0) return 0;
    const unfinished = new Set(jobs.map((job) => job.id));
    const heartbeat = setInterval(() => {
      this.renew([...unfinished]).catch((error: unknown) => {
        this.logger.warn({ msg: `Lease renewal failed: ${message(error)}` });
      });
    }, this.options.leaseHeartbeatMs);
    try {
      for (const job of jobs) {
        await this.process(job, unfinished);
        unfinished.delete(job.id);
      }
    } finally {
      clearInterval(heartbeat);
    }
    return jobs.length;
  }

  private async process(job: ClaimedJob, unfinished: Set<string>): Promise<void> {
    const scope = {
      jobId: job.id,
      executionId: job.executionId,
      organizationId: job.organizationId,
    };
    try {
      const held = await this.renew([...unfinished]);
      if (!held.has(job.id)) {
        this.logger.warn({ ...scope, msg: 'Lease lost before the job started; skipping it' });
        return;
      }
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

  private async renew(jobIds: string[]): Promise<Set<string>> {
    const held = new Set(await this.queue.extend(jobIds));
    const lost = jobIds.filter((id) => !held.has(id));
    if (lost.length > 0) {
      this.logger.warn({ msg: `Lost the lease on ${String(lost.length)} job(s) of the batch` });
    }
    return held;
  }

  start(): void {
    this.polling.start();
  }

  /** Stops polling and waits for the batch in flight. */
  async stop(): Promise<void> {
    await this.polling.stop();
  }
}
