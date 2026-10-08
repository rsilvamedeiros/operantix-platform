import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, InvalidCursorError } from './keyset-cursor';

describe('keyset cursor', () => {
  it('round-trips a row id', () => {
    const id = '6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c';

    expect(decodeCursor(encodeCursor(id))).toBe(id);
  });

  it.each(['garbage', encodeCursor('not-a-uuid'), ''])('rejects %j', (cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(InvalidCursorError);
  });
});
