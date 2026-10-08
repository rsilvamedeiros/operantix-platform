import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { parseKeyring } from '@operantix/secrets';
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
  http: { timeoutMs: 1_000, allowPrivateNetworks: false, maxResponseBytes: 1_024 },
  retry: { maxStepAttempts: 3, baseDelayMs: 1_000 },
  secrets: { keyring: parseKeyring(`k1:${randomBytes(32).toString('base64')}`) },
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
