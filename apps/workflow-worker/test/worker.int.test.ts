import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/database';
import type { WorkflowStep } from '../src/engine.schema';
import { ExecutionRunner } from '../src/execution/execution-runner';
import { JobQueue } from '../src/queue/job-queue';
import { LogStep } from '../src/steps/log-step';
import { StepDispatcher } from '../src/steps/step-dispatcher';
import type { StepHandler } from '../src/steps/step-handler';
import { WorkerLoop } from '../src/worker-loop';
import { type EngineDatabase, startEngineDatabase } from './support/engine-database';

const log = (id: string): WorkflowStep => ({ id, name: id, type: 'log', config: { message: id } });

describe('workflow worker against PostgreSQL', () => {
  let database: EngineDatabase;
  let loop: WorkerLoop;
  let queue: JobQueue;

  beforeAll(async () => {
    database = await startEngineDatabase();
  });

  beforeEach(async () => {
    // Every test starts with an empty queue; executions stay for assertions.
    await database.owner.query('DELETE FROM execution_jobs');
    const db = createDatabase(database.worker);
    queue = new JobQueue(db, { workerId: 'worker-test', leaseSeconds: 30 });
    const handlers: StepHandler[] = [
      new LogStep(),
      { type: 'boom', run: () => Promise.reject(new Error('remote said no')) },
      {
        // Simulates a user cancelling while this step runs.
        type: 'cancel',
        run: async (_step, context) => {
          await database.owner.query(`UPDATE executions SET status = 'CANCELLED' WHERE id = $1`, [
            context.executionId,
          ]);
          return null;
        },
      },
    ];
    loop = new WorkerLoop(queue, new ExecutionRunner(db, new StepDispatcher(handlers)), {
      batchSize: 10,
      pollIntervalMs: 10,
    });
  });

  afterAll(async () => {
    await database.stop();
  });

  const execution = async (id: string) => {
    const { rows } = await database.owner.query<{
      status: string;
      error: Record<string, unknown> | null;
      started_at: Date | null;
      finished_at: Date | null;
    }>('SELECT status, error, started_at, finished_at FROM executions WHERE id = $1', [id]);
    return rows[0];
  };
  const steps = async (id: string) =>
    (
      await database.owner.query<{
        step_id: string;
        status: string;
        attempts: number;
        output: unknown;
        error: Record<string, unknown> | null;
      }>(
        'SELECT step_id, status, attempts, output, error FROM step_executions WHERE execution_id = $1 ORDER BY position',
        [id],
      )
    ).rows;
  const jobCount = async (id: string) =>
    (await database.owner.query('SELECT 1 FROM execution_jobs WHERE execution_id = $1', [id]))
      .rowCount;

  it('runs a pending execution through its steps and removes the job', async () => {
    const seeded = await database.seedExecution([log('first'), log('second')]);

    await loop.tick();

    expect(await execution(seeded.executionId)).toMatchObject({
      status: 'SUCCEEDED',
      error: null,
      started_at: expect.any(Date) as unknown,
      finished_at: expect.any(Date) as unknown,
    });
    expect(await steps(seeded.executionId)).toEqual([
      {
        step_id: 'first',
        status: 'SUCCEEDED',
        attempts: 1,
        output: { message: 'first' },
        error: null,
      },
      {
        step_id: 'second',
        status: 'SUCCEEDED',
        attempts: 1,
        output: { message: 'second' },
        error: null,
      },
    ]);
    expect(await jobCount(seeded.executionId)).toBe(0);
  });

  it('fails the execution on a step it cannot run and skips the rest', async () => {
    const seeded = await database.seedExecution([
      log('first'),
      { id: 'beam', name: 'Beam', type: 'teleport', config: {} },
      log('last'),
    ]);

    await loop.tick();

    expect(await execution(seeded.executionId)).toMatchObject({
      status: 'FAILED',
      error: { code: 'STEP_FAILED', stepId: 'beam' },
    });
    expect((await steps(seeded.executionId)).map((s) => [s.step_id, s.status])).toEqual([
      ['first', 'SUCCEEDED'],
      ['beam', 'FAILED'],
      ['last', 'SKIPPED'],
    ]);
    expect((await steps(seeded.executionId))[1]?.error).toMatchObject({
      code: 'STEP_TYPE_NOT_SUPPORTED',
    });
    expect(await jobCount(seeded.executionId)).toBe(0);
  });

  it('records the error of a step whose handler throws', async () => {
    const seeded = await database.seedExecution([
      { id: 'call', name: 'Call', type: 'boom', config: {} },
    ]);

    await loop.tick();

    expect(await steps(seeded.executionId)).toMatchObject([
      {
        status: 'FAILED',
        attempts: 1,
        error: { code: 'STEP_ERROR', message: 'remote said no' },
      },
    ]);
    expect(await execution(seeded.executionId)).toMatchObject({ status: 'FAILED' });
  });

  it('fails a step that is missing from the workflow version', async () => {
    const seeded = await database.seedExecution([log('known')]);
    await database.owner.query(
      `UPDATE step_executions SET position = 1 WHERE execution_id = $1 AND step_id = 'known'`,
      [seeded.executionId],
    );
    await database.owner.query(
      `INSERT INTO step_executions (organization_id, execution_id, step_id, position)
       VALUES ($1, $2, 'ghost', 0)`,
      [seeded.organizationId, seeded.executionId],
    );

    await loop.tick();

    expect((await steps(seeded.executionId)).map((s) => [s.step_id, s.status])).toEqual([
      ['ghost', 'FAILED'],
      ['known', 'SKIPPED'],
    ]);
  });

  it('stops before the next step when the execution was cancelled mid-run', async () => {
    const seeded = await database.seedExecution([
      { id: 'stop', name: 'Stop', type: 'cancel', config: {} },
      log('after'),
    ]);

    await loop.tick();

    expect(await execution(seeded.executionId)).toMatchObject({ status: 'CANCELLED' });
    expect((await steps(seeded.executionId)).map((s) => [s.step_id, s.status])).toEqual([
      ['stop', 'SUCCEEDED'],
      ['after', 'PENDING'],
    ]);
    expect(await jobCount(seeded.executionId)).toBe(0);
  });

  it('resumes an execution a crashed worker left half done', async () => {
    const seeded = await database.seedExecution([log('done'), log('pending')], {
      status: 'RUNNING',
      stepStatuses: ['SUCCEEDED', 'PENDING'],
      jobAttempts: 1,
    });

    await loop.tick();

    expect((await steps(seeded.executionId)).map((s) => [s.step_id, s.status, s.attempts])).toEqual(
      [
        ['done', 'SUCCEEDED', 1],
        ['pending', 'SUCCEEDED', 1],
      ],
    );
    expect(await execution(seeded.executionId)).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('does not run a cancelled execution', async () => {
    const seeded = await database.seedExecution([log('never')], { status: 'CANCELLED' });

    await loop.tick();

    expect(await steps(seeded.executionId)).toMatchObject([{ status: 'PENDING', attempts: 0 }]);
    expect(await jobCount(seeded.executionId)).toBe(0);
  });

  it('fails an execution whose job ran out of attempts', async () => {
    const seeded = await database.seedExecution([log('never')], {
      status: 'RUNNING',
      jobAttempts: 5,
    });

    await loop.tick();

    expect(await execution(seeded.executionId)).toMatchObject({
      status: 'FAILED',
      error: { code: 'MAX_ATTEMPTS_EXCEEDED' },
    });
    expect(await steps(seeded.executionId)).toMatchObject([{ status: 'SKIPPED' }]);
    expect(await jobCount(seeded.executionId)).toBe(0);
  });

  it('runs executions of every tenant, each inside its own tenant scope', async () => {
    const acme = await database.seedExecution([log('a')]);
    const globex = await database.seedExecution([log('g')]);

    await loop.tick();

    expect(await execution(acme.executionId)).toMatchObject({ status: 'SUCCEEDED' });
    expect(await execution(globex.executionId)).toMatchObject({ status: 'SUCCEEDED' });
  });

  describe('leases', () => {
    it('gives concurrent workers disjoint jobs', async () => {
      const seeded = await Promise.all(
        Array.from({ length: 6 }, () => database.seedExecution([log('x')])),
      );
      const other = new JobQueue(createDatabase(database.worker), {
        workerId: 'worker-other',
        leaseSeconds: 30,
      });

      const [mine, theirs] = await Promise.all([queue.claim(6), other.claim(6)]);

      const ids = [...mine, ...theirs].map((j) => j.executionId).sort();
      expect(ids).toEqual(seeded.map((s) => s.executionId).sort());
    });

    it('reclaims a job only after its lease expires', async () => {
      const seeded = await database.seedExecution([log('x')]);
      const [first] = await queue.claim(1);

      const whileLeased = await queue.claim(1);
      await database.owner.query(
        `UPDATE execution_jobs SET locked_until = now() - interval '1 second' WHERE id = $1`,
        [seeded.jobId],
      );
      const afterExpiry = await queue.claim(1);

      expect(first).toMatchObject({ executionId: seeded.executionId, attempts: 1 });
      expect(whileLeased).toEqual([]);
      expect(afterExpiry).toMatchObject([{ executionId: seeded.executionId, attempts: 2 }]);
    });

    it('does not claim a job before its run_after', async () => {
      const seeded = await database.seedExecution([log('x')]);
      await database.owner.query(
        `UPDATE execution_jobs SET run_after = now() + interval '1 hour' WHERE id = $1`,
        [seeded.jobId],
      );

      expect(await queue.claim(1)).toEqual([]);
    });
  });
});
