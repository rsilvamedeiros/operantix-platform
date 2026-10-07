import { hostname } from 'node:os';
import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const positive = z.coerce.number().int().positive();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: port.default(5432),
  DATABASE_NAME: z.string().min(1),
  // A role of its own, not the API's (ADR-0018): see infrastructure/docker/postgres/worker-role.sql.
  WORKER_DATABASE_USER: z.string().min(1),
  WORKER_DATABASE_PASSWORD: z.string().min(1),
  WORKER_ID: z.string().min(1).optional(),
  WORKER_BATCH_SIZE: positive.max(100).default(5),
  WORKER_POLL_INTERVAL_MS: positive.default(1000),
  WORKER_LEASE_SECONDS: positive.default(60),
});

export interface WorkerConfig {
  env: 'development' | 'test' | 'production';
  /** Recorded on leased jobs, to tell which instance holds them. */
  workerId: string;
  database: { host: string; port: number; name: string; user: string; password: string };
  queue: { batchSize: number; pollIntervalMs: number; leaseSeconds: number };
  http: { timeoutMs: number; allowPrivateNetworks: boolean; maxResponseBytes: number };
  retry: { maxStepAttempts: number; baseDelayMs: number };
}

export class ConfigValidationError extends Error {
  override name = 'ConfigValidationError';
}

export function loadConfig(env: Record<string, string | undefined>): WorkerConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // Only variable names and rule messages: values may be secrets.
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`);
    throw new ConfigValidationError(`Invalid environment configuration: ${problems.join('; ')}`);
  }

  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    workerId: e.WORKER_ID ?? `${hostname()}-${String(process.pid)}`,
    database: {
      host: e.DATABASE_HOST,
      port: e.DATABASE_PORT,
      name: e.DATABASE_NAME,
      user: e.WORKER_DATABASE_USER,
      password: e.WORKER_DATABASE_PASSWORD,
    },
    queue: {
      batchSize: e.WORKER_BATCH_SIZE,
      pollIntervalMs: e.WORKER_POLL_INTERVAL_MS,
      leaseSeconds: e.WORKER_LEASE_SECONDS,
    },
    // Not read from the environment yet.
    http: { timeoutMs: 10_000, allowPrivateNetworks: false, maxResponseBytes: 65_536 },
    retry: { maxStepAttempts: 3, baseDelayMs: 2_000 },
  };
}
