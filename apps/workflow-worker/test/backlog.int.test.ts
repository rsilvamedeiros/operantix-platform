import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/database';
import { OutboxRelay } from '../src/outbox/outbox-relay';
import { JobQueue } from '../src/queue/job-queue';
import { type EngineDatabase, startEngineDatabase } from './support/engine-database';

describe('backlog signals', () => {
  let database: EngineDatabase;
  let queue: JobQueue;
  let relay: OutboxRelay;

  beforeAll(async () => {
    database = await startEngineDatabase();
    queue = new JobQueue(createDatabase(database.worker), {
      workerId: 'backlog-test',
      leaseSeconds: 30,
    });
    relay = new OutboxRelay(
      database.relay,
      { publish: () => Promise.reject(new Error('not used')) },
      { batchSize: 10, retentionHours: 24 },
    );
  });

  beforeEach(async () => {
    await database.owner.query('DELETE FROM execution_jobs');
    await database.owner.query('DELETE FROM outbox_events');
  });

  afterAll(async () => {
    await database.stop();
  });

  describe('execution queue', () => {
    const seedJob = async (set: string) => {
      const { jobId } = await database.seedExecution([]);
      await database.owner.query(`UPDATE execution_jobs SET ${set} WHERE id = $1`, [jobId]);
    };

    it('is empty when nothing waits', async () => {
      expect(await queue.backlog()).toEqual({ waiting: 0, oldestWaitingSeconds: 0 });
    });

    it('counts due jobs across tenants and reports how long the oldest has waited', async () => {
      await seedJob("run_after = now() - interval '90 seconds'");
      await seedJob("run_after = now() - interval '10 seconds'");

      const backlog = await queue.backlog();

      expect(backlog.waiting).toBe(2);
      expect(backlog.oldestWaitingSeconds).toBeGreaterThanOrEqual(90);
      expect(backlog.oldestWaitingSeconds).toBeLessThan(120);
    });

    it('leaves out jobs that are delayed or held by a live lease', async () => {
      await seedJob("run_after = now() + interval '1 hour'");
      await seedJob("locked_until = now() + interval '30 seconds', locked_by = 'other'");
      await seedJob("run_after = now() - interval '5 seconds'");

      expect((await queue.backlog()).waiting).toBe(1);
    });

    it('counts a job whose lease expired, since no worker holds it', async () => {
      await seedJob("locked_until = now() - interval '1 second', locked_by = 'dead'");

      expect((await queue.backlog()).waiting).toBe(1);
    });
  });

  describe('outbox', () => {
    const seedEvent = async (createdAgo: string, published: boolean) => {
      const { organizationId, executionId, jobId } = await database.seedExecution([]);
      await database.owner.query('DELETE FROM execution_jobs WHERE id = $1', [jobId]);
      await database.owner.query(
        `INSERT INTO outbox_events
           (organization_id, event_id, topic, partition_key, event_type, payload, created_at, published_at)
         VALUES ($1, $2, 'topic', $3, 'execution.step.started', '{}',
           now() - $4::interval, CASE WHEN $5 THEN now() ELSE NULL END)`,
        [organizationId, randomUUID(), executionId, createdAgo, published],
      );
    };

    it('is empty when everything was published', async () => {
      await seedEvent('5 minutes', true);

      expect(await relay.backlog()).toEqual({ unpublished: 0, oldestUnpublishedSeconds: 0 });
    });

    it('counts unpublished events and reports the age of the oldest', async () => {
      await seedEvent('120 seconds', false);
      await seedEvent('5 seconds', false);
      await seedEvent('10 minutes', true);

      const backlog = await relay.backlog();

      expect(backlog.unpublished).toBe(2);
      expect(backlog.oldestUnpublishedSeconds).toBeGreaterThanOrEqual(120);
      expect(backlog.oldestUnpublishedSeconds).toBeLessThan(150);
    });
  });
});
