import { z } from 'zod';
import { ConfigValidationError } from './config';

const port = z.coerce.number().int().min(1).max(65535);
const positive = z.coerce.number().int().positive();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: port.default(5432),
  DATABASE_NAME: z.string().min(1),
  // A role of its own (ADR-0021): see infrastructure/docker/postgres/relay-role.sql.
  RELAY_DATABASE_USER: z.string().min(1),
  RELAY_DATABASE_PASSWORD: z.string().min(1),
  // Comma-separated host:port list.
  KAFKA_BROKERS: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(/^[^\s:]+:\d+$/)).min(1)),
  KAFKA_CLIENT_ID: z.string().min(1).default('operantix-outbox-relay'),
  RELAY_DELIVERY_TIMEOUT_MS: positive.default(10_000),
  RELAY_BATCH_SIZE: positive.max(1_000).default(100),
  RELAY_POLL_INTERVAL_MS: positive.default(500),
  RELAY_RETENTION_HOURS: positive.default(72),
  RELAY_CLEANUP_INTERVAL_MS: positive.default(60_000),
});

export interface RelayConfig {
  env: 'development' | 'test' | 'production';
  database: { host: string; port: number; name: string; user: string; password: string };
  kafka: { brokers: string[]; clientId: string; deliveryTimeoutMs: number };
  relay: {
    batchSize: number;
    pollIntervalMs: number;
    /** Published rows older than this are deleted. */
    retentionHours: number;
    cleanupIntervalMs: number;
  };
}

export function loadRelayConfig(env: Record<string, string | undefined>): RelayConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // Only variable names and rule codes: values may be secrets.
    const problems = parsed.error.issues.map((issue) => `${String(issue.path[0])}: ${issue.code}`);
    throw new ConfigValidationError(`Invalid environment configuration: ${problems.join('; ')}`);
  }

  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    database: {
      host: e.DATABASE_HOST,
      port: e.DATABASE_PORT,
      name: e.DATABASE_NAME,
      user: e.RELAY_DATABASE_USER,
      password: e.RELAY_DATABASE_PASSWORD,
    },
    kafka: {
      brokers: e.KAFKA_BROKERS,
      clientId: e.KAFKA_CLIENT_ID,
      deliveryTimeoutMs: e.RELAY_DELIVERY_TIMEOUT_MS,
    },
    relay: {
      batchSize: e.RELAY_BATCH_SIZE,
      pollIntervalMs: e.RELAY_POLL_INTERVAL_MS,
      retentionHours: e.RELAY_RETENTION_HOURS,
      cleanupIntervalMs: e.RELAY_CLEANUP_INTERVAL_MS,
    },
  };
}
