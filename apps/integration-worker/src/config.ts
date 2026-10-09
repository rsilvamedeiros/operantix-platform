import { type Keyring, KeyringError, parseKeyring } from '@operantix/secrets';
import { z } from 'zod';
import type { CircuitPolicy } from './webhooks/circuit-breaker';

const port = z.coerce.number().int().min(1).max(65535);
const positive = z.coerce.number().int().positive();

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_HOST: z.string().min(1),
    DATABASE_PORT: port.default(5432),
    DATABASE_NAME: z.string().min(1),
    // A role of its own (ADR-0023): see infrastructure/docker/postgres/integration-role.sql.
    INTEGRATION_DATABASE_USER: z.string().min(1),
    INTEGRATION_DATABASE_PASSWORD: z.string().min(1),
    KAFKA_BROKERS: z.string().min(1),
    KAFKA_CLIENT_ID: z.string().min(1).default('operantix-integration-worker'),
    WEBHOOK_CONSUMER_GROUP: z.string().min(1).default('opx.integration-worker.webhooks'),
    WEBHOOK_BATCH_SIZE: positive.max(100).default(10),
    WEBHOOK_POLL_INTERVAL_MS: positive.default(1_000),
    WEBHOOK_LEASE_SECONDS: positive.default(60),
    WEBHOOK_MAX_ATTEMPTS: positive.max(20).default(8),
    WEBHOOK_RETRY_BASE_DELAY_MS: positive.default(30_000),
    WEBHOOK_RETRY_MAX_DELAY_MS: positive.default(3_600_000),
    WEBHOOK_DISABLE_AFTER_FAILURES: positive.default(20),
    // Per-endpoint circuit breaker (ADR-0032): trips well before the endpoint is disabled.
    WEBHOOK_CIRCUIT_FAILURE_THRESHOLD: positive.default(5),
    WEBHOOK_CIRCUIT_COOLDOWN_MS: positive.default(30_000),
    WEBHOOK_CIRCUIT_MAX_COOLDOWN_MS: positive.default(900_000),
    WEBHOOK_HTTP_TIMEOUT_MS: positive.default(10_000),
    WEBHOOK_HTTP_ALLOW_PRIVATE_NETWORKS: z.enum(['true', 'false']).default('false'),
    WEBHOOK_HTTP_MAX_RESPONSE_BYTES: positive.max(65_536).default(4_096),
    SECRETS_ENCRYPTION_KEYS: z.string().min(1),
  })
  .refine(
    (e) => !(e.NODE_ENV === 'production' && e.WEBHOOK_HTTP_ALLOW_PRIVATE_NETWORKS === 'true'),
    {
      path: ['WEBHOOK_HTTP_ALLOW_PRIVATE_NETWORKS'],
      message: 'Private network access is not allowed in production',
    },
  )
  .refine((e) => e.WEBHOOK_CIRCUIT_FAILURE_THRESHOLD < e.WEBHOOK_DISABLE_AFTER_FAILURES, {
    path: ['WEBHOOK_CIRCUIT_FAILURE_THRESHOLD'],
    message: 'Must be lower than WEBHOOK_DISABLE_AFTER_FAILURES',
  })
  .refine((e) => e.WEBHOOK_CIRCUIT_MAX_COOLDOWN_MS >= e.WEBHOOK_CIRCUIT_COOLDOWN_MS, {
    path: ['WEBHOOK_CIRCUIT_MAX_COOLDOWN_MS'],
    message: 'Must not be lower than WEBHOOK_CIRCUIT_COOLDOWN_MS',
  })
  // A request outliving its lease could be claimed and sent twice by another instance.
  .refine((e) => e.WEBHOOK_HTTP_TIMEOUT_MS < e.WEBHOOK_LEASE_SECONDS * 1000, {
    path: ['WEBHOOK_HTTP_TIMEOUT_MS'],
    message: 'Must be shorter than WEBHOOK_LEASE_SECONDS',
  });

export interface DeliveryConfig {
  batchSize: number;
  pollIntervalMs: number;
  leaseSeconds: number;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Consecutive failed attempts after which an endpoint is disabled. */
  disableAfterFailures: number;
  circuit: CircuitPolicy;
}

export interface IntegrationConfig {
  env: 'development' | 'test' | 'production';
  database: { host: string; port: number; name: string; user: string; password: string };
  /** Retry and dead-letter topics are `<groupId>.retry` and `<groupId>.dlq`. */
  kafka: { brokers: string[]; clientId: string; groupId: string };
  delivery: DeliveryConfig;
  http: { timeoutMs: number; allowPrivateNetworks: boolean; maxResponseBytes: number };
  secrets: { keyring: Keyring };
}

export class ConfigValidationError extends Error {
  override name = 'ConfigValidationError';
}

export function loadConfig(env: Record<string, string | undefined>): IntegrationConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // Only variable names and rule messages: values may be secrets.
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`);
    throw new ConfigValidationError(`Invalid environment configuration: ${problems.join('; ')}`);
  }

  const e = parsed.data;
  let keyring: Keyring;
  try {
    keyring = parseKeyring(e.SECRETS_ENCRYPTION_KEYS);
  } catch (error) {
    if (!(error instanceof KeyringError)) throw error;
    // KeyringError messages name entries and rules, never key material.
    throw new ConfigValidationError(
      `Invalid environment configuration: SECRETS_ENCRYPTION_KEYS: ${error.message}`,
    );
  }
  return {
    env: e.NODE_ENV,
    database: {
      host: e.DATABASE_HOST,
      port: e.DATABASE_PORT,
      name: e.DATABASE_NAME,
      user: e.INTEGRATION_DATABASE_USER,
      password: e.INTEGRATION_DATABASE_PASSWORD,
    },
    kafka: {
      brokers: e.KAFKA_BROKERS.split(',').map((broker) => broker.trim()),
      clientId: e.KAFKA_CLIENT_ID,
      groupId: e.WEBHOOK_CONSUMER_GROUP,
    },
    delivery: {
      batchSize: e.WEBHOOK_BATCH_SIZE,
      pollIntervalMs: e.WEBHOOK_POLL_INTERVAL_MS,
      leaseSeconds: e.WEBHOOK_LEASE_SECONDS,
      maxAttempts: e.WEBHOOK_MAX_ATTEMPTS,
      baseDelayMs: e.WEBHOOK_RETRY_BASE_DELAY_MS,
      maxDelayMs: e.WEBHOOK_RETRY_MAX_DELAY_MS,
      disableAfterFailures: e.WEBHOOK_DISABLE_AFTER_FAILURES,
      circuit: {
        failureThreshold: e.WEBHOOK_CIRCUIT_FAILURE_THRESHOLD,
        cooldownMs: e.WEBHOOK_CIRCUIT_COOLDOWN_MS,
        maxCooldownMs: e.WEBHOOK_CIRCUIT_MAX_COOLDOWN_MS,
      },
    },
    http: {
      timeoutMs: e.WEBHOOK_HTTP_TIMEOUT_MS,
      allowPrivateNetworks: e.WEBHOOK_HTTP_ALLOW_PRIVATE_NETWORKS === 'true',
      maxResponseBytes: e.WEBHOOK_HTTP_MAX_RESPONSE_BYTES,
    },
    secrets: { keyring },
  };
}
