import { describe, expect, it } from 'vitest';
import { ConfigValidationError } from './config';
import { loadRelayConfig } from './relay-config';

const required = {
  DATABASE_HOST: 'localhost',
  DATABASE_NAME: 'operantix',
  RELAY_DATABASE_USER: 'operantix_relay',
  RELAY_DATABASE_PASSWORD: 'local-only',
  KAFKA_BROKERS: 'localhost:9092',
};

describe('loadRelayConfig', () => {
  it('applies defaults', () => {
    expect(loadRelayConfig(required)).toEqual({
      env: 'development',
      database: {
        host: 'localhost',
        port: 5432,
        name: 'operantix',
        user: 'operantix_relay',
        password: 'local-only',
      },
      kafka: {
        brokers: ['localhost:9092'],
        clientId: 'operantix-outbox-relay',
        deliveryTimeoutMs: 10_000,
      },
      relay: { batchSize: 100, pollIntervalMs: 500, retentionHours: 72, cleanupIntervalMs: 60_000 },
    });
  });

  it('reads explicit values and a broker list', () => {
    const config = loadRelayConfig({
      ...required,
      NODE_ENV: 'production',
      DATABASE_PORT: '6543',
      KAFKA_BROKERS: 'kafka-1:9092, kafka-2:9092',
      KAFKA_CLIENT_ID: 'relay-a',
      RELAY_DELIVERY_TIMEOUT_MS: '5000',
      RELAY_BATCH_SIZE: '20',
      RELAY_POLL_INTERVAL_MS: '250',
      RELAY_RETENTION_HOURS: '24',
      RELAY_CLEANUP_INTERVAL_MS: '30000',
    });

    expect(config).toMatchObject({
      env: 'production',
      database: { port: 6543 },
      kafka: {
        brokers: ['kafka-1:9092', 'kafka-2:9092'],
        clientId: 'relay-a',
        deliveryTimeoutMs: 5_000,
      },
      relay: { batchSize: 20, pollIntervalMs: 250, retentionHours: 24, cleanupIntervalMs: 30_000 },
    });
  });

  it('names invalid variables without echoing their values', () => {
    const attempt = () =>
      loadRelayConfig({ ...required, RELAY_DATABASE_PASSWORD: '', KAFKA_BROKERS: ' , ' });

    expect(attempt).toThrow(ConfigValidationError);
    expect(attempt).toThrow(/RELAY_DATABASE_PASSWORD/);
    expect(attempt).toThrow(/KAFKA_BROKERS/);
    expect(attempt).not.toThrow(/local-only/);
  });
});
