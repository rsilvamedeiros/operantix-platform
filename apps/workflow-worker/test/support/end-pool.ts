import type { Pool } from 'pg';

/**
 * pg-pool's end() resolves before its clients have disconnected. Stopping the container right
 * after it can kill a connection that is still closing, and the pool then emits an unhandled
 * 'error' (57P01). Waiting for every client's 'remove' event closes that window.
 */
export async function endPool(pool: Pool): Promise<void> {
  let open = pool.totalCount;
  const disconnected = new Promise<void>((resolve) => {
    if (open === 0) resolve();
    pool.on('remove', () => {
      open -= 1;
      if (open === 0) resolve();
    });
  });
  await pool.end();
  await disconnected;
}
