export class ConfigValidationError extends Error {}
export function loadConfig(_env: Record<string, string | undefined>): unknown {
  throw new Error('not implemented');
}
