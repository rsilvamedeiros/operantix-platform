import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig } from './config';

const password = randomUUID();
const key = randomBytes(32).toString('base64');

const env = {
  DATABASE_HOST: 'db.internal',
  DATABASE_NAME: 'operantix',
  INTEGRATION_DATABASE_USER: 'operantix_integration',
  INTEGRATION_DATABASE_PASSWORD: password,
  KAFKA_BROKERS: 'kafka-1:9092, kafka-2:9092',
  SECRETS_ENCRYPTION_KEYS: `k1:${key}`,
};

describe('loadConfig', () => {
  it('builds typed config with defaults', () => {
    const config = loadConfig(env);

    expect(config).toEqual({
      env: 'development',
      database: {
        host: 'db.internal',
        port: 5432,
        name: 'operantix',
        user: 'operantix_integration',
        password,
      },
      kafka: {
        brokers: ['kafka-1:9092', 'kafka-2:9092'],
        clientId: 'operantix-integration-worker',
        groupId: 'opx.integration-worker.webhooks',
      },
      delivery: {
        batchSize: 10,
        pollIntervalMs: 1_000,
        leaseSeconds: 60,
        maxAttempts: 8,
        baseDelayMs: 30_000,
        maxDelayMs: 3_600_000,
        disableAfterFailures: 20,
        circuit: { failureThreshold: 5, cooldownMs: 30_000, maxCooldownMs: 900_000 },
      },
      http: { timeoutMs: 10_000, allowPrivateNetworks: false, maxResponseBytes: 4_096 },
      secrets: { keyring: { active: 'k1', keys: new Map([['k1', Buffer.from(key, 'base64')]]) } },
    });
  });

  it('names missing variables without echoing values', () => {
    const { INTEGRATION_DATABASE_USER: _omitted, ...rest } = env;

    expect(() => loadConfig(rest)).toThrow(/INTEGRATION_DATABASE_USER/);
    try {
      loadConfig({ ...rest, SECRETS_ENCRYPTION_KEYS: 'k1:short' });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect(String(error)).not.toContain(password);
      expect(String(error)).not.toContain('short');
    }
  });

  it('rejects a bad keyring, naming the variable', () => {
    expect(() => loadConfig({ ...env, SECRETS_ENCRYPTION_KEYS: 'k1:short' })).toThrow(
      /SECRETS_ENCRYPTION_KEYS/,
    );
  });

  it('refuses private network access in production', () => {
    expect(() =>
      loadConfig({
        ...env,
        NODE_ENV: 'production',
        WEBHOOK_HTTP_ALLOW_PRIVATE_NETWORKS: 'true',
      }),
    ).toThrow(/WEBHOOK_HTTP_ALLOW_PRIVATE_NETWORKS/);
  });

  it('requires the HTTP timeout to fit inside the lease', () => {
    expect(() =>
      loadConfig({ ...env, WEBHOOK_LEASE_SECONDS: '5', WEBHOOK_HTTP_TIMEOUT_MS: '5000' }),
    ).toThrow(/WEBHOOK_HTTP_TIMEOUT_MS/);
  });

  describe('circuit breaker', () => {
    it('reads the threshold and cooldowns', () => {
      const config = loadConfig({
        ...env,
        WEBHOOK_CIRCUIT_FAILURE_THRESHOLD: '3',
        WEBHOOK_CIRCUIT_COOLDOWN_MS: '5000',
        WEBHOOK_CIRCUIT_MAX_COOLDOWN_MS: '60000',
      });

      expect(config.delivery.circuit).toEqual({
        failureThreshold: 3,
        cooldownMs: 5_000,
        maxCooldownMs: 60_000,
      });
    });

    it('must trip before the endpoint is disabled', () => {
      expect(() =>
        loadConfig({
          ...env,
          WEBHOOK_CIRCUIT_FAILURE_THRESHOLD: '20',
          WEBHOOK_DISABLE_AFTER_FAILURES: '20',
        }),
      ).toThrow(/WEBHOOK_CIRCUIT_FAILURE_THRESHOLD/);
    });

    it('never caps the cooldown below its base', () => {
      expect(() =>
        loadConfig({
          ...env,
          WEBHOOK_CIRCUIT_COOLDOWN_MS: '60000',
          WEBHOOK_CIRCUIT_MAX_COOLDOWN_MS: '1000',
        }),
      ).toThrow(/WEBHOOK_CIRCUIT_MAX_COOLDOWN_MS/);
    });
  });
});
