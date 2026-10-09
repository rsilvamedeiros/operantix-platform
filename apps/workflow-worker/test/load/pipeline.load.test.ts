import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/database';
import type { WorkflowStep } from '../../src/engine.schema';
import { ExecutionRunner } from '../../src/execution/execution-runner';
import { JobQueue } from '../../src/queue/job-queue';
import { StepDispatcher } from '../../src/steps/step-dispatcher';
import { WorkerLoop } from '../../src/worker-loop';
import { type EngineDatabase, startEngineDatabase } from '../support/engine-database';

// Reference scenario for the execution pipeline (docs/testing/load.md): a burst of executions
// spread over tenants, drained by several worker replicas at once. It asserts the invariants that
// must hold at any load (every job runs once, nothing is left behind) and prints throughput and
// latency as reference numbers; absolute speed depends on the machine, so it is not asserted.
const EXECUTIONS = Number(process.env.LOAD_EXECUTIONS ?? 600);
const WORKERS = Number(process.env.LOAD_WORKERS ?? 4);
const TENANTS = 5;
const STEPS_PER_EXECUTION = 3;

describe('execution pipeline under load', () => {
  let database: EngineDatabase;

  beforeAll(async () => {
    // Two log lines per job would drown the result and cost time.
    Logger.overrideLogger(false);
    database = await startEngineDatabase();
  });

  afterAll(async () => {
    await database.stop();
  });

  it(`drains ${String(EXECUTIONS)} executions across ${String(WORKERS)} concurrent workers, each step exactly once`, async () => {
    const stepRuns = new Map<string, number>();
    const steps: WorkflowStep[] = Array.from({ length: STEPS_PER_EXECUTION }, (_, i) => ({
      id: `s${String(i)}`,
      name: `s${String(i)}`,
      type: 'count',
      config: {},
    }));
    const organizations = Array.from({ length: TENANTS }, () => crypto.randomUUID());
    const executionIds: string[] = [];
    for (let i = 0; i < EXECUTIONS; i += 1) {
      const seeded = await database.seedExecution(steps, {
        organizationId: organizations[i % TENANTS] ?? '',
      });
      executionIds.push(seeded.executionId);
    }

    const db = createDatabase(database.worker);
    const loops = Array.from({ length: WORKERS }, (_, n) => {
      const queue = new JobQueue(db, { workerId: `load-worker-${String(n)}`, leaseSeconds: 30 });
      const runner = new ExecutionRunner(
        db,
        new StepDispatcher([
          {
            type: 'count',
            run: (step, context) => {
              const key = `${context.executionId}/${step.id}`;
              stepRuns.set(key, (stepRuns.get(key) ?? 0) + 1);
              return Promise.resolve(null);
            },
          },
        ]),
      );
      return new WorkerLoop(queue, runner, {
        batchSize: 10,
        pollIntervalMs: 20,
        leaseHeartbeatMs: 10_000,
      });
    });
    const monitor = new JobQueue(db, { workerId: 'load-monitor', leaseSeconds: 30 });
    const backlogAtStart = (await monitor.backlog()).waiting;

    const started = Date.now();
    loops.forEach((loop) => {
      loop.start();
    });
    await waitUntil(
      async () => (await monitor.backlog()).waiting === 0 && (await inFlight()) === 0,
    );
    const elapsedMs = Date.now() - started;
    await Promise.all(loops.map((loop) => loop.stop()));

    const { rows: states } = await database.owner.query<{ status: string; n: string }>(
      'SELECT status, count(*) AS n FROM executions WHERE id = ANY($1) GROUP BY status',
      [executionIds],
    );
    const { rows: latency } = await database.owner.query<{ p50: number; p95: number; p99: number }>(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY l)::float8 AS p50,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY l)::float8 AS p95,
              percentile_cont(0.99) WITHIN GROUP (ORDER BY l)::float8 AS p99
         FROM (SELECT extract(epoch FROM finished_at - created_at) * 1000 AS l
                 FROM executions WHERE id = ANY($1)) t`,
      [executionIds],
    );
    const { rows: jobs } = await database.owner.query('SELECT 1 FROM execution_jobs');

    console.log(
      `[load] ${String(EXECUTIONS)} executions x ${String(STEPS_PER_EXECUTION)} steps, ${String(WORKERS)} workers: ` +
        `${(EXECUTIONS / (elapsedMs / 1000)).toFixed(1)} executions/s in ${String(elapsedMs)} ms; ` +
        `latency p50/p95/p99 = ${latency.map((l) => [l.p50, l.p95, l.p99].map((v) => v.toFixed(0)).join('/')).join('')} ms`,
    );

    expect(backlogAtStart).toBe(EXECUTIONS);
    expect(states).toEqual([{ status: 'SUCCEEDED', n: String(EXECUTIONS) }]);
    expect(jobs).toEqual([]);
    expect(stepRuns.size).toBe(EXECUTIONS * STEPS_PER_EXECUTION);
    expect([...stepRuns.values()].filter((runs) => runs !== 1)).toEqual([]);

    async function inFlight(): Promise<number> {
      const { rows } = await database.owner.query<{ n: string }>(
        `SELECT count(*) AS n FROM executions WHERE id = ANY($1) AND status IN ('PENDING','RUNNING')`,
        [executionIds],
      );
      return Number(rows[0]?.n ?? 0);
    }
  });
});

async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 240_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the queue to drain');
}
