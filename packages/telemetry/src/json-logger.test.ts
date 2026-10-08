import { describe, expect, it } from 'vitest';
import { JsonLogger } from './json-logger';
import { correlationStore, currentCorrelationId, runWithCorrelation } from './correlation';

function capture(options: Partial<ConstructorParameters<typeof JsonLogger>[0]> = {}) {
  const lines: string[] = [];
  const logger = new JsonLogger({
    service: 'platform-api',
    environment: 'test',
    write: (line) => lines.push(line),
    now: () => new Date('2026-10-08T12:00:00.000Z'),
    ...options,
  });
  const records = (): Record<string, unknown>[] =>
    lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { logger, lines, records };
}

describe('JsonLogger', () => {
  it('writes one JSON line with the common fields', () => {
    const { logger, records } = capture();
    logger.log('listening on 3000', 'Bootstrap');
    expect(records()).toEqual([
      {
        timestamp: '2026-10-08T12:00:00.000Z',
        level: 'info',
        service: 'platform-api',
        environment: 'test',
        context: 'Bootstrap',
        message: 'listening on 3000',
      },
    ]);
  });

  it('maps Nest levels to log levels (verbose is folded into debug)', () => {
    const { logger, records } = capture({ level: 'debug' });
    logger.error('e');
    logger.warn('w');
    logger.debug('d');
    logger.verbose('v');
    expect(records().map((r) => r.level)).toEqual(['error', 'warn', 'debug', 'debug']);
  });

  it('drops records below the configured level', () => {
    const { logger, lines } = capture({ level: 'warn' });
    logger.log('info');
    logger.debug('debug');
    logger.warn('kept');
    expect(lines).toHaveLength(1);
  });

  it('adds the correlation id of the running scope', () => {
    const { logger, records } = capture();
    runWithCorrelation({ correlationId: 'req-1' }, () => {
      logger.log('inside');
    });
    logger.log('outside');
    expect(records()[0]).toMatchObject({ correlationId: 'req-1' });
    expect(records()[1]).not.toHaveProperty('correlationId');
  });

  it('keeps object messages as fields without leaking secret-looking keys', () => {
    const { logger, records } = capture();
    logger.log(
      { event: 'login', authorization: 'Bearer abc', nested: { password: 'p', ok: 1 } },
      'Auth',
    );
    expect(records()[0]).toMatchObject({
      message: 'login',
      fields: { authorization: '[redacted]', nested: { password: '[redacted]', ok: 1 } },
    });
  });

  it('logs an error with its name and message but never the stack', () => {
    const { logger, lines, records } = capture();
    logger.error(new TypeError('boom'), 'Worker');
    expect(records()[0]).toMatchObject({
      level: 'error',
      message: 'boom',
      error: { name: 'TypeError' },
    });
    expect(lines[0]).not.toContain('stack');
  });

  it('survives values JSON cannot serialize', () => {
    const { logger, records } = capture();
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    logger.log({ event: 'loop', loop, big: 10n });
    expect(records()[0]).toMatchObject({ message: 'loop' });
  });
});

describe('correlation', () => {
  it('exposes the id only inside the scope', () => {
    expect(currentCorrelationId()).toBeUndefined();
    const inside = runWithCorrelation({ correlationId: 'abc' }, () => currentCorrelationId());
    expect(inside).toBe('abc');
    expect(correlationStore.getStore()).toBeUndefined();
  });
});
