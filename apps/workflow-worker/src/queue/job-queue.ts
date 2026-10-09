import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../database';
import { executionJobs } from '../engine.schema';

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

/** Jobs due and waiting for a worker, the scaling signal for the worker deployment. */
export interface QueueBacklog {
  waiting: number;
  /** Seconds the longest-waiting job has been due; 0 when nothing waits. */
  oldestWaitingSeconds: number;
}

/**
 * The execution_jobs queue (ADR-0018). Claims are a single statement: the inner SELECT locks
 * due, unleased rows and skips rows another worker is claiming, so concurrent workers get
 * disjoint batches without waiting on each other.
 */
export class JobQueue {
  constructor(
    private readonly db: Database,
    private readonly options: JobQueueOptions,
  ) {}

  /** Leases up to `limit` due jobs that no live lease holds. */
  async claim(limit: number): Promise<ClaimedJob[]> {
    const { rows } = await this.db.execute<{
      id: string;
      organization_id: string;
      execution_id: string;
      attempts: number;
      max_attempts: number;
    }>(sql`
      UPDATE execution_jobs
      SET locked_until = now() + make_interval(secs => ${this.options.leaseSeconds}),
          locked_by = ${this.options.workerId},
          attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM execution_jobs
        WHERE run_after <= now() AND (locked_until IS NULL OR locked_until < now())
        ORDER BY run_after
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, organization_id, execution_id, attempts, max_attempts`);
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      executionId: row.execution_id,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    }));
  }

  /**
   * Renews this worker's lease on the given jobs and returns the ones it still holds. A job
   * another worker claimed after the lease lapsed is no longer ours and is left out. Matching on
   * `locked_by` rather than the expiry lets a briefly lapsed lease be recovered while nobody
   * else has claimed the job.
   */
  async extend(jobIds: string[]): Promise<string[]> {
    if (jobIds.length === 0) return [];
    const rows = await this.db
      .update(executionJobs)
      .set({ lockedUntil: sql`now() + make_interval(secs => ${this.options.leaseSeconds})` })
      .where(
        and(inArray(executionJobs.id, jobIds), eq(executionJobs.lockedBy, this.options.workerId)),
      )
      .returning({ id: executionJobs.id });
    return rows.map((row) => row.id);
  }

  /** Due jobs no live lease holds, across tenants (the worker role reads the whole queue). */
  async backlog(): Promise<QueueBacklog> {
    const { rows } = await this.db.execute<{ waiting: string; oldest: number | null }>(sql`
      SELECT count(*) AS waiting,
             extract(epoch FROM now() - min(run_after))::float8 AS oldest
      FROM execution_jobs
      WHERE run_after <= now() AND (locked_until IS NULL OR locked_until < now())`);
    return {
      waiting: Number(rows[0]?.waiting ?? 0),
      oldestWaitingSeconds: Math.max(0, rows[0]?.oldest ?? 0),
    };
  }

  /** Removes a job whose execution reached a terminal state. */
  async complete(jobId: string): Promise<void> {
    await this.db.delete(executionJobs).where(eq(executionJobs.id, jobId));
  }
}
