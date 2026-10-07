import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: port.default(3000),
  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: port.default(5432),
  DATABASE_NAME: z.string().min(1),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string().min(1),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: port.default(6379),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  database: { host: string; port: number; name: string; user: string; password: string };
  redis: { host: string; port: number };
  health: { checkTimeoutMs: number };
}

export class ConfigValidationError extends Error {
  override name = 'ConfigValidationError';
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    // Only variable names and rule messages: values may be secrets.
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`);
    throw new ConfigValidationError(`Invalid environment configuration: ${problems.join('; ')}`);
  }

  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    database: {
      host: e.DATABASE_HOST,
      port: e.DATABASE_PORT,
      name: e.DATABASE_NAME,
      user: e.DATABASE_USER,
      password: e.DATABASE_PASSWORD,
    },
    redis: { host: e.REDIS_HOST, port: e.REDIS_PORT },
    health: { checkTimeoutMs: e.HEALTH_CHECK_TIMEOUT_MS },
  };
}
