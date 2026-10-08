import { describe, expect, it } from 'vitest';
import { decodeHeaders, dueAt, messageKey, retrySource } from './kafka-headers';

describe('decodeHeaders', () => {
  it('turns buffers, strings and repeated headers into strings, skipping empty ones', () => {
    expect(
      decodeHeaders({
        'event-type': Buffer.from('execution.completed'),
        plain: 'text',
        repeated: [Buffer.from('a'), 'b'],
        missing: undefined,
      }),
    ).toEqual({ 'event-type': 'execution.completed', plain: 'text', repeated: 'a,b' });
  });

  it('accepts a message without headers', () => {
    expect(decodeHeaders(undefined)).toEqual({});
  });
});

describe('messageKey', () => {
  it('reads the key, or an empty key when there is none', () => {
    expect(messageKey(Buffer.from('execution-1'))).toBe('execution-1');
    expect(messageKey(null)).toBe('');
    expect(messageKey(undefined)).toBe('');
  });
});

describe('dueAt', () => {
  it('reads the due time, treating a missing or garbled one as due now', () => {
    expect(dueAt({ 'retry-not-before': '1791460000000' })).toBe(1791460000000);
    expect(dueAt({})).toBe(0);
    expect(dueAt({ 'retry-not-before': 'soon' })).toBe(0);
  });
});

describe('retrySource', () => {
  it('reads where a retried event was first consumed', () => {
    expect(
      retrySource(
        {
          'source-topic': 'opx.execution.events.v1',
          'source-partition': '2',
          'source-offset': '41',
        },
        'fallback.retry',
      ),
    ).toEqual({ topic: 'opx.execution.events.v1', partition: '2', offset: '41' });
  });

  it('falls back to the retry topic when the coordinates are missing', () => {
    expect(retrySource({}, 'fallback.retry')).toEqual({
      topic: 'fallback.retry',
      partition: '',
      offset: '',
    });
  });
});
