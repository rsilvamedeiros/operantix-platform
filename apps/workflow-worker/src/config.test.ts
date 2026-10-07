import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig } from './config';

const required = {
  DATABASE_HOST: 'localhost',
  DATABASE_NAME: 'operantix',
  WORKER_DATABASE_USER: 'operantix_worker',
  WORKER_DATABASE_PASSWORD: 'local-only',
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig(required);

    expect(config).toMatchObject({
      env: 'development',
      database: {
        host: 'localhost',
        port: 5432,
        name: 'operantix',
        user: 'operantix_worker',
        password: 'local-only',
      },
      queue: { batchSize: 5, pollIntervalMs: 1000, leaseSeconds: 60 },
    });
    expect(config.workerId).toMatch(/.+/);
  });

  it('reads explicit values', () => {
    const config = loadConfig({
      ...required,
      NODE_ENV: 'production',
      DATABASE_PORT: '6543',
      WORKER_ID: 'worker-a',
      WORKER_BATCH_SIZE: '10',
      WORKER_POLL_INTERVAL_MS: '250',
      WORKER_LEASE_SECONDS: '120',
    });

    expect(config).toMatchObject({
      env: 'production',
      workerId: 'worker-a',
      database: { port: 6543 },
      queue: { batchSize: 10, pollIntervalMs: 250, leaseSeconds: 120 },
    });
  });

  it('names invalid variables without echoing their values', () => {
    const attempt = () =>
      loadConfig({ ...required, WORKER_DATABASE_PASSWORD: '', WORKER_BATCH_SIZE: '0' });

    expect(attempt).toThrow(ConfigValidationError);
    expect(attempt).toThrow(/WORKER_DATABASE_PASSWORD/);
    expect(attempt).toThrow(/WORKER_BATCH_SIZE/);
  });
});
