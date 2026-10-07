export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  database: { host: string; port: number; name: string; user: string; password: string };
  redis: { host: string; port: number };
  health: { checkTimeoutMs: number };
}

export class ConfigValidationError extends Error {}

export function loadConfig(_env: Record<string, string | undefined>): AppConfig {
  throw new Error('not implemented');
}
