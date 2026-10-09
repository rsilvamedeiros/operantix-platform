export type DependencyState = 'up' | 'down';

export type PlatformStatus =
  | { state: 'up'; checks: Record<string, DependencyState> }
  | { state: 'degraded'; checks: Record<string, DependencyState> }
  | { state: 'unreachable' };

export interface PlatformStatusOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const UNREACHABLE: PlatformStatus = { state: 'unreachable' };

function parseChecks(body: unknown): Record<string, DependencyState> | null {
  if (typeof body !== 'object' || body === null || !('checks' in body)) return null;
  const { checks } = body;
  if (typeof checks !== 'object' || checks === null) return null;
  const parsed: Record<string, DependencyState> = {};
  for (const [name, state] of Object.entries(checks as Record<string, unknown>)) {
    if (state !== 'up' && state !== 'down') return null;
    parsed[name] = state;
  }
  return parsed;
}

/**
 * Reads the Platform API readiness. Anything unexpected (network error, timeout, wrong status,
 * malformed body) is "unreachable": the page shows that, never the error or a stack trace.
 */
export async function fetchPlatformStatus({
  baseUrl,
  fetch: fetchImpl = fetch,
  timeoutMs = 3000,
}: PlatformStatusOptions): Promise<PlatformStatus> {
  try {
    const response = await fetchImpl(`${baseUrl}/health/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200 && response.status !== 503) return UNREACHABLE;
    const checks = parseChecks(await response.json());
    if (checks === null) return UNREACHABLE;
    return { state: response.status === 200 ? 'up' : 'degraded', checks };
  } catch {
    return UNREACHABLE;
  }
}
