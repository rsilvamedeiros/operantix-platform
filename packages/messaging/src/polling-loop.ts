export interface PollingLoopOptions {
  /** A tick that handled this many items probably left more: poll again without sleeping. */
  batchSize: number;
  pollIntervalMs: number;
}

/**
 * Calls `tick` until stopped, sleeping between ticks that found less than a full batch. A tick
 * that throws is reported to `onError` and retried after the interval, so an unavailable
 * dependency never stops the loop.
 */
export class PollingLoop {
  private running = false;
  private current: Promise<void> | undefined;
  private wake: (() => void) | undefined;

  constructor(
    private readonly tick: () => Promise<number>,
    private readonly options: PollingLoopOptions,
    private readonly onError: (error: unknown) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.current = this.poll();
  }

  /** Stops polling and waits for the tick in flight. */
  async stop(): Promise<void> {
    this.running = false;
    this.wake?.();
    await this.current;
  }

  private async poll(): Promise<void> {
    while (this.running) {
      let handled = 0;
      try {
        handled = await this.tick();
      } catch (error) {
        this.onError(error);
      }
      if (handled < this.options.batchSize && this.isRunning()) await this.sleep();
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
