import { hostname } from 'node:os';
import { type Keyring, KeyringError, parseKeyring } from '@operantix/secrets';
import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const positive = z.coerce.number().int().positive();

const EnvSchema = z
  .object({
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
    WORKER_HTTP_TIMEOUT_MS: positive.default(10_000),
    WORKER_HTTP_ALLOW_PRIVATE_NETWORKS: z.enum(['true', 'false']).default('false'),
    WORKER_HTTP_MAX_RESPONSE_BYTES: positive.max(1_048_576).default(65_536),
    WORKER_STEP_MAX_ATTEMPTS: positive.max(10).default(3),
    WORKER_RETRY_BASE_DELAY_MS: positive.default(2_000),
    // Opens connection credentials for HTTP steps (ADR-0025); same keyring as platform-api.
    SECRETS_ENCRYPTION_KEYS: z.string().min(1),
    // The AI service for ai_classify steps (ADR-0028); without it those steps fail permanently.
    AI_SERVICE_URL: z.url({ protocol: /^https?$/ }).optional(),
    AI_SERVICE_TOKEN: z.string().min(32).optional(),
    // Keep it above the AI service's timeout x (retries + 1), or a slow call is cut and retried.
    WORKER_AI_TIMEOUT_MS: positive.default(45_000),
  })
  .refine(
    (e) => !(e.NODE_ENV === 'production' && e.WORKER_HTTP_ALLOW_PRIVATE_NETWORKS === 'true'),
    {
      path: ['WORKER_HTTP_ALLOW_PRIVATE_NETWORKS'],
      message: 'Private network access is not allowed in production',
    },
  )
  // A step outliving its lease could be claimed and run twice by another worker.
  .refine((e) => e.WORKER_HTTP_TIMEOUT_MS < e.WORKER_LEASE_SECONDS * 1000, {
    path: ['WORKER_HTTP_TIMEOUT_MS'],
    message: 'Must be shorter than WORKER_LEASE_SECONDS',
  })
  .refine((e) => e.WORKER_AI_TIMEOUT_MS < e.WORKER_LEASE_SECONDS * 1000, {
    path: ['WORKER_AI_TIMEOUT_MS'],
    message: 'Must be shorter than WORKER_LEASE_SECONDS',
  })
  .refine((e) => e.AI_SERVICE_URL === undefined || e.AI_SERVICE_TOKEN !== undefined, {
    path: ['AI_SERVICE_TOKEN'],
    message: 'Required with AI_SERVICE_URL',
  });

export interface WorkerConfig {
  env: 'development' | 'test' | 'production';
  /** Recorded on leased jobs, to tell which instance holds them. */
  workerId: string;
  database: { host: string; port: number; name: string; user: string; password: string };
  queue: { batchSize: number; pollIntervalMs: number; leaseSeconds: number };
  http: { timeoutMs: number; allowPrivateNetworks: boolean; maxResponseBytes: number };
  retry: { maxStepAttempts: number; baseDelayMs: number };
  secrets: { keyring: Keyring };
  /** Unset when AI_SERVICE_URL is: ai_classify steps then fail as not configured. */
  ai?: { url: string; token: string; timeoutMs: number };
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
    http: {
      timeoutMs: e.WORKER_HTTP_TIMEOUT_MS,
      allowPrivateNetworks: e.WORKER_HTTP_ALLOW_PRIVATE_NETWORKS === 'true',
      maxResponseBytes: e.WORKER_HTTP_MAX_RESPONSE_BYTES,
    },
    retry: {
      maxStepAttempts: e.WORKER_STEP_MAX_ATTEMPTS,
      baseDelayMs: e.WORKER_RETRY_BASE_DELAY_MS,
    },
    secrets: { keyring },
    ...(e.AI_SERVICE_URL !== undefined && e.AI_SERVICE_TOKEN !== undefined
      ? {
          ai: {
            url: e.AI_SERVICE_URL,
            token: e.AI_SERVICE_TOKEN,
            timeoutMs: e.WORKER_AI_TIMEOUT_MS,
          },
        }
      : {}),
  };
}
