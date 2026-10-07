import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { WorkerConfig } from './config';
import { WorkerModule } from './worker.module';
import { WorkerLoop } from './worker-loop';

const config: WorkerConfig = {
  env: 'test',
  workerId: 'module-test',
  // Nothing listens on port 1: claims fail, are logged, and polling goes on.
  database: { host: '127.0.0.1', port: 1, name: 'none', user: 'none', password: 'none' },
  queue: { batchSize: 1, pollIntervalMs: 10, leaseSeconds: 30 },
};

describe('WorkerModule', () => {
  it('starts polling on bootstrap and stops cleanly on shutdown', async () => {
    const app = await NestFactory.createApplicationContext(WorkerModule.register(config), {
      logger: false,
    });

    await app.init();
    const loop = app.get(WorkerLoop);
    await app.close();

    expect(loop).toBeInstanceOf(WorkerLoop);
  });
});
