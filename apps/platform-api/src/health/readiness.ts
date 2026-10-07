export interface ReadinessCheck {
  readonly name: string;
  check(): Promise<void>;
}

export type DependencyStatus = 'up' | 'down';

export interface ReadinessReport {
  status: 'ok' | 'error';
  checks: Record<string, DependencyStatus>;
}

export function evaluateReadiness(
  _checks: readonly ReadinessCheck[],
  _timeoutMs: number,
): Promise<ReadinessReport> {
  return Promise.reject(new Error('not implemented'));
}
