import { describe, expect, it, vi } from 'vitest';
import { PollingLoop } from './polling-loop';

describe('PollingLoop', () => {
  it('polls again at once after a full batch, and sleeps after a partial one', async () => {
    const results = [2, 2, 1];
    const tick = vi.fn(() => Promise.resolve(results.shift() ?? 0));
    const loop = new PollingLoop(tick, { batchSize: 2, pollIntervalMs: 60_000 }, () => undefined);

    loop.start();
    await vi.waitFor(() => {
      expect(tick).toHaveBeenCalledTimes(3);
    });
    await loop.stop();

    expect(tick).toHaveBeenCalledTimes(3);
  });

  it('reports a failed tick and keeps polling', async () => {
    const errors: unknown[] = [];
    let calls = 0;
    const loop = new PollingLoop(
      () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('database down')) : Promise.resolve(0);
      },
      { batchSize: 1, pollIntervalMs: 5 },
      (error) => errors.push(error),
    );

    loop.start();
    loop.start();
    await vi.waitFor(() => {
      expect(calls).toBeGreaterThanOrEqual(2);
    });
    await loop.stop();

    expect(errors).toEqual([new Error('database down')]);
  });

  it('stops while sleeping without waiting for the interval', async () => {
    const loop = new PollingLoop(
      () => Promise.resolve(0),
      { batchSize: 1, pollIntervalMs: 60_000 },
      () => undefined,
    );

    loop.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const started = Date.now();
    await loop.stop();

    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
