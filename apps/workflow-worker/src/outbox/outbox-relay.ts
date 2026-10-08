import { randomBytes } from 'node:crypto';
import { parseEvent } from '@operantix/contracts';
import type { Pool, PoolClient } from 'pg';
import type { EventPublisher, OutgoingMessage } from '../messaging/event-publisher';

export interface OutboxRelayOptions {
  batchSize: number;
  retentionHours: number;
}

interface OutboxRow {
  id: string;
  topic: string;
  partition_key: string;
  payload: unknown;
}

// Session-level advisory lock: only the relay holding it publishes, so events leave in `id`
// order. It goes away with the session, so a relay that dies hands over automatically.
const LEADER_LOCK = `hashtext('operantix:outbox-relay')`;

// Rows deleted per cleanup statement, to keep each delete short.
const CLEANUP_BATCH = 1_000;

/**
 * Publishes the transactional outbox (ADR-0011, ADR-0021): unpublished rows in `id` order,
 * marked published only after the broker acknowledged them. A crash between publish and
 * mark re-sends that batch, which consumers absorb by `eventId` (at-least-once).
 */
export class OutboxRelay {
  private leader: PoolClient | undefined;

  constructor(
    private readonly pool: Pool,
    private readonly publisher: EventPublisher,
    private readonly options: OutboxRelayOptions,
  ) {}

  /** Publishes one batch if this relay leads; returns how many events were published. */
  async tick(): Promise<number> {
    if (!(await this.lead())) return 0;
    // No transaction or row lock is held while the broker is called: leadership already
    // guarantees a single publisher.
    const { rows } = await this.pool.query<OutboxRow>(
      `SELECT id, topic, partition_key, payload FROM outbox_events
       WHERE published_at IS NULL ORDER BY id LIMIT $1`,
      [this.options.batchSize],
    );
    if (rows.length === 0) return 0;
    await this.publisher.publish(rows.map(toMessage));
    await this.pool.query(
      'UPDATE outbox_events SET published_at = now() WHERE id = ANY($1::bigint[])',
      [rows.map((row) => row.id)],
    );
    return rows.length;
  }

  /** Deletes published rows past retention; returns how many were deleted. */
  async cleanup(): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM outbox_events WHERE id IN (
         SELECT id FROM outbox_events
         WHERE published_at < now() - make_interval(hours => $1) LIMIT $2)`,
      [this.options.retentionHours, CLEANUP_BATCH],
    );
    return rowCount ?? 0;
  }

  /** Gives up leadership, so another relay can take over. */
  async release(): Promise<void> {
    const leader = this.leader;
    this.leader = undefined;
    if (!leader) return;
    try {
      await leader.query(`SELECT pg_advisory_unlock(${LEADER_LOCK})`);
      leader.release();
    } catch (error) {
      // A broken session already dropped the lock; discard the connection.
      leader.release(error instanceof Error ? error : true);
    }
  }

  private async lead(): Promise<boolean> {
    if (this.leader) return true;
    const client = await this.pool.connect();
    let locked = false;
    try {
      const { rows } = await client.query<{ locked: boolean }>(
        `SELECT pg_try_advisory_lock(${LEADER_LOCK}) AS locked`,
      );
      locked = rows[0]?.locked === true;
    } finally {
      if (!locked) client.release();
    }
    if (!locked) return false;
    // The lock lives in this session: if the connection breaks, leadership is lost with it.
    client.on('error', () => {
      if (this.leader !== client) return;
      this.leader = undefined;
      client.release(true);
    });
    this.leader = client;
    return true;
  }
}

/** The envelope as the message value, keyed for ordering, with headers for routing and tracing. */
function toMessage(row: OutboxRow): OutgoingMessage {
  // Rows are written only through createEvent; parsing again keeps the headers type-safe and
  // stops a corrupted row loudly instead of publishing it.
  const event = parseEvent(row.payload);
  return {
    topic: row.topic,
    key: row.partition_key,
    value: JSON.stringify(row.payload),
    headers: {
      'event-id': event.eventId,
      'event-type': event.eventType,
      'event-version': String(event.eventVersion),
      // W3C trace context: the event's trace, with a span id for this publication.
      traceparent: `00-${event.traceId}-${randomBytes(8).toString('hex')}-01`,
    },
  };
}
