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

const options = { batchSize: 2, pollIntervalMs: 10, leaseHeartbeatMs: 20 };

function fakes(batches: ClaimedJob[][]) {
  const queue = {
    claim: vi.fn((_limit: number) => Promise.resolve(batches.shift() ?? [])),
    complete: vi.fn((_id: string) => Promise.resolve()),
    // By default every lease is still held.
    extend: vi.fn((ids: string[]) => Promise.resolve(ids)),
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

  it('renews the leases of the whole batch while a long job runs, and stops when the batch ends', async () => {
    const { queue, runner } = fakes([[job('a'), job('b')]]);
    let finish: () => void = () => undefined;
    runner.run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => {
            resolve('SUCCEEDED');
          };
        }),
    );
    const loop = new WorkerLoop(queue, runner, options);

    const ticking = loop.tick();
    await vi.waitFor(() => {
      // The check before job `a` ran, then at least one heartbeat during it.
      expect(queue.extend.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    expect(queue.extend).toHaveBeenLastCalledWith(['a', 'b']);
    finish();
    await ticking;
    const renewals = queue.extend.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(queue.extend.mock.calls.length).toBe(renewals);
  });

  it('does not run a job whose lease another worker took before its turn', async () => {
    const { queue, runner } = fakes([[job('a'), job('b')]]);
    queue.extend.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.filter((id) => id !== 'b')),
    );
    const loop = new WorkerLoop(queue, runner, options);

    await loop.tick();

    expect(runner.run.mock.calls.map(([j]) => j.id)).toEqual(['a']);
    expect(queue.complete.mock.calls).toEqual([['a']]);
  });

  it('keeps running the batch when a heartbeat fails', async () => {
    const { queue, runner } = fakes([[job('a')]]);
    runner.run.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return 'SUCCEEDED' as const;
    });
    queue.extend
      .mockImplementationOnce((ids: string[]) => Promise.resolve(ids))
      .mockRejectedValue(new Error('database went away'));
    const loop = new WorkerLoop(queue, runner, options);

    await loop.tick();

    expect(queue.complete).toHaveBeenCalledWith('a');
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

  it('ignores a second start', async () => {
    const { queue, runner } = fakes([]);
    const loop = new WorkerLoop(queue, runner, options);

    loop.start();
    loop.start();
    await loop.stop();

    expect(queue.claim).toHaveBeenCalledTimes(1);
  });

  it('logs non-Error failures without crashing', async () => {
    const { queue, runner } = fakes([[job('a')]]);
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a library may reject with a string
    runner.run.mockReturnValueOnce(Promise.reject('timeout'));
    const loop = new WorkerLoop(queue, runner, options);

    await expect(loop.tick()).resolves.toBe(1);
    expect(queue.complete).not.toHaveBeenCalled();
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
