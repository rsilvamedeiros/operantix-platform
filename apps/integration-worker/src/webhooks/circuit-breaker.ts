export interface CircuitPolicy {
  /** Consecutive failed attempts that open the circuit. */
  failureThreshold: number;
  /** How long the circuit stays open when it first trips; doubles for each further failure. */
  cooldownMs: number;
  maxCooldownMs: number;
}

/** What is known about one destination (webhook endpoint). */
export interface CircuitState {
  consecutiveFailures: number;
  /** When the circuit may be probed again; null when it never opened. */
  openUntil: Date | null;
}

export type CircuitDecision =
  | { kind: 'send' }
  /** Open: do not call the destination, try again at `until`. */
  | { kind: 'defer'; until: Date }
  /** Half-open: the cooldown is over, one attempt may test the destination. */
  | { kind: 'probe' };

/**
 * Closed while failures are below the threshold, open until the cooldown ends, then half-open.
 * The caller must make "one probe at a time" true by claiming it atomically; this only decides.
 */
export function decideCircuit(
  state: CircuitState,
  policy: CircuitPolicy,
  now: Date,
): CircuitDecision {
  if (state.consecutiveFailures < policy.failureThreshold) return { kind: 'send' };
  if (state.openUntil !== null && state.openUntil.getTime() > now.getTime()) {
    return { kind: 'defer', until: state.openUntil };
  }
  return { kind: 'probe' };
}

/** When the circuit opens until after a failure that made the count `consecutiveFailures`. */
export function cooldownAfterFailure(
  consecutiveFailures: number,
  policy: CircuitPolicy,
  now: Date,
): Date | null {
  if (consecutiveFailures < policy.failureThreshold) return null;
  const doublings = consecutiveFailures - policy.failureThreshold;
  // Beyond 30 doublings the cap has long applied; the guard keeps 2 ** n finite.
  const cooldown = Math.min(policy.cooldownMs * 2 ** Math.min(doublings, 30), policy.maxCooldownMs);
  return new Date(now.getTime() + cooldown);
}
