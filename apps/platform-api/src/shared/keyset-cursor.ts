const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidCursorError extends Error {
  override name = 'InvalidCursorError';
}

/**
 * Opaque cursor for keyset pagination over `(created_at, id)`: the id of the last row of a
 * page. Queries compare against that row itself, so timestamps keep full precision.
 */
export function encodeCursor(id: string): string {
  return Buffer.from(id).toString('base64url');
}

export function decodeCursor(cursor: string): string {
  const id = Buffer.from(cursor, 'base64url').toString();
  if (!UUID.test(id)) throw new InvalidCursorError(cursor);
  return id;
}
