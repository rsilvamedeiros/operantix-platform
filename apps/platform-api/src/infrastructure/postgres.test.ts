import { describe, expect, it } from 'vitest';
import { createPostgresPool } from './postgres';

describe('createPostgresPool', () => {
  it('survives an error emitted by an idle client', async () => {
    // pg emits "error" on the pool when an idle client's connection drops (e.g. a
    // database restart); without a listener Node turns it into an uncaught exception.
    const pool = createPostgresPool(
      { host: 'localhost', port: 1, name: 'db', user: 'user', password: 'x' },
      100,
    );

    expect(() => pool.emit('error', new Error('terminating connection'))).not.toThrow();

    await pool.end();
  });
});
