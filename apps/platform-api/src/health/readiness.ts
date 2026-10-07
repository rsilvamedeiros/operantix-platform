import { errorMessage } from '../shared/error-message';

export interface ReadinessCheck {
  readonly name: string;
  check(): Promise<void>;
}

export type DependencyStatus = 'up' | 'down';

export interface ReadinessReport {
  status: 'ok' | 'error';
  checks: Record<string, DependencyStatus>;
}

export interface CheckFailure {
  name: string;
  reason: string;
}

export async function evaluateReadiness(
  checks: readonly ReadinessCheck[],
  timeoutMs: number,
  onFailure: (failure: CheckFailure) => void = () => undefined,
): Promise<ReadinessReport> {
  const results = await Promise.all(
    checks.map(async (dependency): Promise<[string, DependencyStatus]> => {
      const { name } = dependency;
      try {
        await withTimeout(dependency.check(), timeoutMs);
        return [name, 'up'];
      } catch (error) {
        onFailure({ name, reason: errorMessage(error) });
        return [name, 'down'];
      }
    }),
  );

  const statuses = Object.fromEntries(results);
  const allUp = results.every(([, status]) => status === 'up');
  return { status: allUp ? 'ok' : 'error', checks: statuses };
}

async function withTimeout(operation: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out after ${String(timeoutMs)}ms`));
    }, timeoutMs);
  });
  try {
    await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
