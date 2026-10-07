import { describe, expect, it, vi } from 'vitest';
import type { ClaimedJob } from './queue/job-queue';
import { type JobRunner, type JobSource, WorkerLoop } from './worker-loop';

const job = (id: string): ClaimedJob => ({
  id,
  organizationId: 'org',
  executionId: `exec-${id}`,
  attempts: 1,
  maxAttempts: 5,
});

const options = { batchSize: 2, pollIntervalMs: 10 };

function fakes(batches: ClaimedJob[][]) {
  const queue = {
    claim: vi.fn((_limit: number) => Promise.resolve(batches.shift() ?? [])),
    complete: vi.fn((_id: string) => Promise.resolve()),
  } satisfies JobSource;
  const runner = {
    run: vi.fn((_job: ClaimedJob) => Promise.resolve('SUCCEEDED' as const)),
  } satisfies JobRunner;
  return { queue, runner };
}

describe('WorkerLoop', () => {
  it('claims a batch, runs each job and completes it', async () => {
    const { queue, runner } = fakes([[job('a'), job('b')]]);
    const loop = new WorkerLoop(queue, runner, options);

    const claimed = await loop.tick();

    expect(claimed).toBe(2);
    expect(queue.claim).toHaveBeenCalledWith(2);
    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(queue.complete.mock.calls).toEqual([['a'], ['b']]);
  });

  it('keeps the lease of a job whose run failed, so it is retried after the lease expires', async () => {
    const { queue, runner } = fakes([[job('a'), job('b')]]);
    runner.run.mockRejectedValueOnce(new Error('database went away'));
    const loop = new WorkerLoop(queue, runner, options);

    await loop.tick();

    expect(queue.complete.mock.calls).toEqual([['b']]);
  });

  it('polls until stopped, and stop waits for the batch in flight', async () => {
    const { queue, runner } = fakes([[job('a')], [], [job('b')]]);
    const loop = new WorkerLoop(queue, runner, options);

    loop.start();
    await vi.waitFor(() => {
      expect(queue.complete).toHaveBeenCalledWith('b');
    });
    await loop.stop();
    const claims = queue.claim.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(queue.claim.mock.calls.length).toBe(claims);
  });

  it('keeps polling after a failed claim', async () => {
    const { queue, runner } = fakes([[job('a')]]);
    queue.claim.mockRejectedValueOnce(new Error('connection refused'));
    const loop = new WorkerLoop(queue, runner, options);

    loop.start();
    await vi.waitFor(() => {
      expect(queue.complete).toHaveBeenCalledWith('a');
    });
    await loop.stop();
  });
});
