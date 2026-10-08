import { describe, expect, it } from 'vitest';
import { currentCorrelationId } from './correlation';
import { createCorrelationMiddleware } from './correlation-middleware';

function run(headerValue: string | string[] | undefined) {
  const middleware = createCorrelationMiddleware({ generate: () => 'generated-id' });
  const headers: Record<string, string> = {};
  let seen: string | undefined;
  middleware(
    { headers: { 'x-correlation-id': headerValue } },
    { setHeader: (name, value) => (headers[name] = value) },
    () => {
      seen = currentCorrelationId();
    },
  );
  return { headers, seen };
}

describe('correlation middleware', () => {
  it('keeps a well-formed incoming id, exposes it to the request and echoes it', () => {
    const { headers, seen } = run('req-123_ABC.x');
    expect(seen).toBe('req-123_ABC.x');
    expect(headers).toEqual({ 'x-correlation-id': 'req-123_ABC.x' });
  });

  it('generates an id when none is sent', () => {
    expect(run(undefined).seen).toBe('generated-id');
  });

  it.each([
    ['too long', 'a'.repeat(129)],
    ['with spaces', 'a b'],
    ['with a newline', 'a\nb'],
    ['empty', ''],
    ['repeated', ['a', 'b']],
  ])('replaces an id that is %s', (_label, value) => {
    const { seen, headers } = run(value);
    expect(seen).toBe('generated-id');
    expect(headers['x-correlation-id']).toBe('generated-id');
  });
});
