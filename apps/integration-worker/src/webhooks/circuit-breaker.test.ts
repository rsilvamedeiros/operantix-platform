import { describe, expect, it } from 'vitest';
import { cooldownAfterFailure, decideCircuit, type CircuitPolicy } from './circuit-breaker';

const policy: CircuitPolicy = { failureThreshold: 5, cooldownMs: 30_000, maxCooldownMs: 240_000 };
const now = new Date('2026-10-09T12:00:00.000Z');
const at = (ms: number) => new Date(now.getTime() + ms);

describe('decideCircuit', () => {
  it('sends while the endpoint has fewer consecutive failures than the threshold', () => {
    expect(decideCircuit({ consecutiveFailures: 4, openUntil: null }, policy, now)).toEqual({
      kind: 'send',
    });
  });

  it('ignores a stale open time once failures are below the threshold', () => {
    expect(decideCircuit({ consecutiveFailures: 0, openUntil: at(60_000) }, policy, now)).toEqual({
      kind: 'send',
    });
  });

  it('defers until the circuit closes while it is open', () => {
    expect(decideCircuit({ consecutiveFailures: 5, openUntil: at(10_000) }, policy, now)).toEqual({
      kind: 'defer',
      until: at(10_000),
    });
  });

  it('lets one probe through once the cooldown has passed', () => {
    expect(decideCircuit({ consecutiveFailures: 5, openUntil: at(-1) }, policy, now)).toEqual({
      kind: 'probe',
    });
    expect(decideCircuit({ consecutiveFailures: 9, openUntil: at(0) }, policy, now)).toEqual({
      kind: 'probe',
    });
  });

  it('treats a tripped circuit with no open time as a probe', () => {
    expect(decideCircuit({ consecutiveFailures: 5, openUntil: null }, policy, now)).toEqual({
      kind: 'probe',
    });
  });
});

describe('cooldownAfterFailure', () => {
  it('does not open the circuit below the threshold', () => {
    expect(cooldownAfterFailure(4, policy, now)).toBeNull();
  });

  it('opens it for the base cooldown at the threshold and doubles for each further failure', () => {
    expect(cooldownAfterFailure(5, policy, now)).toEqual(at(30_000));
    expect(cooldownAfterFailure(6, policy, now)).toEqual(at(60_000));
    expect(cooldownAfterFailure(7, policy, now)).toEqual(at(120_000));
  });

  it('caps the cooldown, however many failures there are', () => {
    expect(cooldownAfterFailure(8, policy, now)).toEqual(at(240_000));
    expect(cooldownAfterFailure(500, policy, now)).toEqual(at(240_000));
  });
});
