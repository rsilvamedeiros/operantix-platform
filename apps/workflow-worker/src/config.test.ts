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
      http: { timeoutMs: 10_000, allowPrivateNetworks: false, maxResponseBytes: 65_536 },
      retry: { maxStepAttempts: 3, baseDelayMs: 2_000 },
    });
    expect(config.workerId).toMatch(/.+/);
  });

  it('reads explicit values', () => {
    const config = loadConfig({
      ...required,
      NODE_ENV: 'test',
      DATABASE_PORT: '6543',
      WORKER_ID: 'worker-a',
      WORKER_BATCH_SIZE: '10',
      WORKER_POLL_INTERVAL_MS: '250',
      WORKER_LEASE_SECONDS: '120',
      WORKER_HTTP_TIMEOUT_MS: '5000',
      WORKER_HTTP_ALLOW_PRIVATE_NETWORKS: 'true',
      WORKER_HTTP_MAX_RESPONSE_BYTES: '1024',
      WORKER_STEP_MAX_ATTEMPTS: '5',
      WORKER_RETRY_BASE_DELAY_MS: '500',
    });

    expect(config).toMatchObject({
      env: 'test',
      workerId: 'worker-a',
      database: { port: 6543 },
      queue: { batchSize: 10, pollIntervalMs: 250, leaseSeconds: 120 },
      http: { timeoutMs: 5_000, allowPrivateNetworks: true, maxResponseBytes: 1_024 },
      retry: { maxStepAttempts: 5, baseDelayMs: 500 },
    });
  });

  it('refuses private network access in production', () => {
    expect(() =>
      loadConfig({
        ...required,
        NODE_ENV: 'production',
        WORKER_HTTP_ALLOW_PRIVATE_NETWORKS: 'true',
      }),
    ).toThrow(/WORKER_HTTP_ALLOW_PRIVATE_NETWORKS/);
  });

  it('requires the HTTP timeout to fit inside the job lease', () => {
    // A step outliving its lease could be claimed and run twice.
    expect(() =>
      loadConfig({ ...required, WORKER_LEASE_SECONDS: '10', WORKER_HTTP_TIMEOUT_MS: '10000' }),
    ).toThrow(/WORKER_HTTP_TIMEOUT_MS/);
  });

  it('names invalid variables without echoing their values', () => {
    const attempt = () =>
      loadConfig({ ...required, WORKER_DATABASE_PASSWORD: '', WORKER_BATCH_SIZE: '0' });

    expect(attempt).toThrow(ConfigValidationError);
    expect(attempt).toThrow(/WORKER_DATABASE_PASSWORD/);
    expect(attempt).toThrow(/WORKER_BATCH_SIZE/);
  });
});
