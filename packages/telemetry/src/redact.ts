const REDACTED = '[redacted]';
const SENSITIVE_KEY = /authorization|cookie|password|passwd|secret|token|api[-_]?key|signature/i;
const MAX_DEPTH = 6;

/** Copy of `value` that is JSON-safe: secret-looking keys masked, cycles and bigints tamed. */
export function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[truncated]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : sanitize(item, depth + 1, seen),
    ]),
  );
}
