import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { OutboxRelay } from './outbox/outbox-relay';
import type { RelayConfig } from './relay-config';
import { RelayModule } from './relay.module';

const config: RelayConfig = {
  env: 'test',
  // Nothing listens on port 1: ticks fail, are logged, and polling goes on.
  database: { host: '127.0.0.1', port: 1, name: 'none', user: 'none', password: 'none' },
  kafka: { brokers: ['127.0.0.1:1'], clientId: 'module-test', deliveryTimeoutMs: 1_000 },
  relay: { batchSize: 1, pollIntervalMs: 10, retentionHours: 1, cleanupIntervalMs: 60_000 },
};

describe('RelayModule', () => {
  it('starts relaying on bootstrap and stops cleanly on shutdown', async () => {
    const app = await NestFactory.createApplicationContext(RelayModule.register(config), {
      logger: false,
    });

    // Starting never waits for the database or the broker: the loop retries until they answer.
    await app.init();
    const relay = app.get(OutboxRelay);
    await app.close();

    expect(relay).toBeInstanceOf(OutboxRelay);
  });
});
