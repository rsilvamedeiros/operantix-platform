import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig } from './config';

const required = {
  DATABASE_HOST: 'localhost',
  DATABASE_NAME: 'operantix',
  WORKER_DATABASE_USER: 'operantix_worker',
  WORKER_DATABASE_PASSWORD: 'local-only',
  // Generated per run so no key material lives in the repo.
  SECRETS_ENCRYPTION_KEYS: `k1:${randomBytes(32).toString('base64')}`,
};

describe('loadConfig', () => {
  it('loads the keyring that opens connection credentials', () => {
    expect(loadConfig(required).secrets.keyring.active).toBe('k1');
  });

  it('requires a valid keyring, naming the variable but not the value', () => {
    const { SECRETS_ENCRYPTION_KEYS: _, ...withoutKeys } = required;

    expect(() => loadConfig(withoutKeys)).toThrow(/SECRETS_ENCRYPTION_KEYS/);
    expect(() => loadConfig({ ...required, SECRETS_ENCRYPTION_KEYS: 'k1:c2hvcnQ=' })).toThrow(
      /SECRETS_ENCRYPTION_KEYS/,
    );
  });

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

  describe('AI service', () => {
    // Built per run so no credential-like literal lives in the repo.
    const token = randomBytes(32).toString('base64url');
    const ai = { AI_SERVICE_URL: 'http://ai-service:8000', AI_SERVICE_TOKEN: token };

    it('is off unless its URL is set', () => {
      expect(loadConfig(required).ai).toBeUndefined();
    });

    it('reads the URL, token and timeout', () => {
      expect(loadConfig({ ...required, ...ai }).ai).toEqual({
        url: 'http://ai-service:8000',
        token,
        timeoutMs: 45_000,
      });
      expect(loadConfig({ ...required, ...ai, WORKER_AI_TIMEOUT_MS: '20000' }).ai?.timeoutMs).toBe(
        20_000,
      );
    });

    it('requires a token of at least 32 characters with the URL, without echoing it', () => {
      expect(() => loadConfig({ ...required, AI_SERVICE_URL: ai.AI_SERVICE_URL })).toThrow(
        /AI_SERVICE_TOKEN/,
      );
      const short = 'short-token-value';
      const attempt = () => loadConfig({ ...required, ...ai, AI_SERVICE_TOKEN: short });

      expect(attempt).toThrow(/AI_SERVICE_TOKEN/);
      expect(attempt).not.toThrow(new RegExp(short));
    });

    it('only accepts http and https URLs', () => {
      expect(() => loadConfig({ ...required, ...ai, AI_SERVICE_URL: 'ftp://ai' })).toThrow(
        /AI_SERVICE_URL/,
      );
    });

    it('requires the AI timeout to fit inside the job lease', () => {
      expect(() =>
        loadConfig({
          ...required,
          ...ai,
          WORKER_LEASE_SECONDS: '30',
          WORKER_AI_TIMEOUT_MS: '30000',
        }),
      ).toThrow(/WORKER_AI_TIMEOUT_MS/);
    });
  });
});
