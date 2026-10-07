export interface WorkerConfig {
  env: 'development' | 'test' | 'production';
  workerId: string;
  database: { host: string; port: number; name: string; user: string; password: string };
  queue: { batchSize: number; pollIntervalMs: number; leaseSeconds: number };
}

export class ConfigValidationError extends Error {
  override name = 'ConfigValidationError';
}

export function loadConfig(_env: Record<string, string | undefined>): WorkerConfig {
  throw new Error('not implemented');
}
