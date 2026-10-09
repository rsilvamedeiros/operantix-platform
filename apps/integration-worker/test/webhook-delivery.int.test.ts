import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/database';
import { WebhookDispatcher } from '../src/webhooks/webhook-dispatcher';
import { WebhookFanOut } from '../src/webhooks/webhook-fan-out';
import { completedEvent } from './support/events';
import { type IntegrationDatabase, startIntegrationDatabase } from './support/integration-database';
import { type Receiver, startReceiver } from './support/receiver';

const delivery = {
  batchSize: 10,
  leaseSeconds: 30,
  maxAttempts: 3,
  baseDelayMs: 60_000,
  maxDelayMs: 600_000,
  disableAfterFailures: 3,
  // Out of reach here: the circuit breaker has its own tests below.
  circuit: { failureThreshold: 999, cooldownMs: 60_000, maxCooldownMs: 240_000 },
};
const http = { timeoutMs: 1_000, allowPrivateNetworks: true, maxResponseBytes: 1_024 };

interface DeliveryRow {
  id: string;
  status: string;
  attempts: number;
  last_status_code: number | null;
  last_error_code: string | null;
  next_attempt_at: Date;
}

describe('webhook delivery', () => {
  let database: IntegrationDatabase;
  let receiver: Receiver;
  let fanOut: WebhookFanOut;
  let dispatcher: WebhookDispatcher;

  beforeAll(async () => {
    [database, receiver] = await Promise.all([startIntegrationDatabase(), startReceiver()]);
    const db = createDatabase(database.integration);
    fanOut = new WebhookFanOut(db);
    dispatcher = new WebhookDispatcher(db, { delivery, http, keyring: database.keyring });
  });

  afterAll(async () => {
    await receiver.close();
    await database.stop();
  });

  beforeEach(async () => {
    receiver.received.length = 0;
    receiver.statuses.clear();
    // Deliveries left by an earlier test would be claimed by this one.
    await database.owner.query('DELETE FROM webhook_deliveries');
  });

  const deliveriesOf = async (endpointId: string) => {
    const { rows } = await database.owner.query<DeliveryRow>(
      `SELECT id, status, attempts, last_status_code, last_error_code, next_attempt_at
         FROM webhook_deliveries WHERE endpoint_id = $1`,
      [endpointId],
    );
    return rows;
  };
  const endpointHealth = async (endpointId: string) => {
    const { rows } = await database.owner.query<{ status: string; consecutive_failures: number }>(
      'SELECT status, consecutive_failures FROM webhook_endpoints WHERE id = $1',
      [endpointId],
    );
    return rows[0];
  };
  /** Makes every pending delivery due now, as if its backoff had elapsed. */
  const elapse = () =>
    database.owner.query(`UPDATE webhook_deliveries SET next_attempt_at = now()`);

  describe('fan-out', () => {
    it("queues one delivery per active endpoint subscribed to the event's type", async () => {
      const acme = await database.seedOrganization();
      const globex = await database.seedOrganization();
      const subscribed = await database.seedEndpoint(acme, { url: receiver.url('/a') });
      const otherType = await database.seedEndpoint(acme, {
        url: receiver.url('/b'),
        eventTypes: ['execution.failed'],
      });
      const disabled = await database.seedEndpoint(acme, {
        url: receiver.url('/c'),
        status: 'DISABLED',
      });
      const otherTenant = await database.seedEndpoint(globex, { url: receiver.url('/d') });

      const queued = await fanOut.handle(completedEvent(acme));

      expect(queued).toBe(1);
      expect(await deliveriesOf(subscribed.id)).toHaveLength(1);
      for (const endpoint of [otherType, disabled, otherTenant]) {
        expect(await deliveriesOf(endpoint.id)).toHaveLength(0);
      }
    });

    it('queues an event only once, however often it is consumed', async () => {
      const org = await database.seedOrganization();
      const endpoint = await database.seedEndpoint(org, { url: receiver.url('/once') });
      const event = completedEvent(org);

      await fanOut.handle(event);
      const again = await fanOut.handle(event);

      expect(again).toBe(0);
      expect(await deliveriesOf(endpoint.id)).toHaveLength(1);
    });
  });

  describe('circuit breaker', () => {
    const circuit = { failureThreshold: 2, cooldownMs: 60_000, maxCooldownMs: 240_000 };
    let breaker: WebhookDispatcher;

    beforeAll(() => {
      breaker = new WebhookDispatcher(createDatabase(database.integration), {
        delivery: { ...delivery, disableAfterFailures: 50, maxAttempts: 10, circuit },
        http,
        keyring: database.keyring,
      });
    });

    const circuitOf = async (endpointId: string) => {
      const { rows } = await database.owner.query<{
        consecutive_failures: number;
        circuit_open_until: Date | null;
        status: string;
      }>(
        'SELECT consecutive_failures, circuit_open_until, status FROM webhook_endpoints WHERE id = $1',
        [endpointId],
      );
      return rows[0];
    };
    const seconds = (ms: number) => new Date(Date.now() + ms);

    it('opens after the threshold of consecutive failures, for the base cooldown', async () => {
      const org = await database.seedOrganization();
      const endpoint = await database.seedEndpoint(org, {
        url: receiver.url('/trip'),
        consecutiveFailures: circuit.failureThreshold - 1,
      });
      receiver.statuses.set('/trip', 503);
      await fanOut.handle(completedEvent(org));

      await breaker.tick();

      const state = await circuitOf(endpoint.id);
      expect(state?.consecutive_failures).toBe(circuit.failureThreshold);
      const opensFor = (state?.circuit_open_until?.getTime() ?? 0) - Date.now();
      expect(opensFor).toBeGreaterThan(circuit.cooldownMs - 5_000);
      expect(opensFor).toBeLessThanOrEqual(circuit.cooldownMs);
    });

    it('does not call an open endpoint, and does not spend an attempt on it', async () => {
      const org = await database.seedOrganization();
      const openUntil = seconds(120_000);
      const endpoint = await database.seedEndpoint(org, {
        url: receiver.url('/open'),
        consecutiveFailures: 3,
        circuitOpenUntil: openUntil,
      });
      await fanOut.handle(completedEvent(org));

      await breaker.tick();

      expect(receiver.received).toHaveLength(0);
      const [row] = await deliveriesOf(endpoint.id);
      expect(row).toMatchObject({ status: 'PENDING', attempts: 0 });
      expect(row?.next_attempt_at.getTime()).toBe(openUntil.getTime());
      const { rows: attempts } = await database.owner.query(
        'SELECT 1 FROM webhook_delivery_attempts WHERE delivery_id = $1',
        [row?.id],
      );
      expect(attempts).toHaveLength(0);
      // Not claimable again until the circuit closes.
      expect(await breaker.tick()).toBe(0);
    });

    it('sends a single probe once the cooldown is over, and closes on success', async () => {
      const org = await database.seedOrganization();
      const endpoint = await database.seedEndpoint(org, {
        url: receiver.url('/recover'),
        consecutiveFailures: 4,
        circuitOpenUntil: seconds(-1_000),
      });
      await fanOut.handle(completedEvent(org));
      await fanOut.handle(completedEvent(org));
      await fanOut.handle(completedEvent(org));

      await breaker.tick();

      expect(receiver.received).toHaveLength(1);
      const rows = await deliveriesOf(endpoint.id);
      expect(rows.map((r) => r.status).sort()).toEqual(['PENDING', 'PENDING', 'SUCCEEDED']);
      expect(rows.filter((r) => r.status === 'PENDING').map((r) => r.attempts)).toEqual([0, 0]);
      expect(await circuitOf(endpoint.id)).toMatchObject({
        consecutive_failures: 0,
        circuit_open_until: null,
      });

      await elapse();
      await breaker.tick();
      expect(receiver.received).toHaveLength(3);
    });

    it('reopens for twice as long when the probe fails', async () => {
      const org = await database.seedOrganization();
      const endpoint = await database.seedEndpoint(org, {
        url: receiver.url('/still-down'),
        consecutiveFailures: circuit.failureThreshold,
        circuitOpenUntil: seconds(-1_000),
      });
      receiver.statuses.set('/still-down', 500);
      await fanOut.handle(completedEvent(org));

      await breaker.tick();

      expect(receiver.received).toHaveLength(1);
      const state = await circuitOf(endpoint.id);
      expect(state?.consecutive_failures).toBe(circuit.failureThreshold + 1);
      const opensFor = (state?.circuit_open_until?.getTime() ?? 0) - Date.now();
      expect(opensFor).toBeGreaterThan(2 * circuit.cooldownMs - 5_000);
      expect(opensFor).toBeLessThanOrEqual(2 * circuit.cooldownMs);
    });

    it('keeps one broken endpoint from holding back the others', async () => {
      const org = await database.seedOrganization();
      const broken = await database.seedEndpoint(org, {
        url: receiver.url('/dead'),
        consecutiveFailures: 3,
        circuitOpenUntil: seconds(120_000),
      });
      const healthy = await database.seedEndpoint(org, { url: receiver.url('/fine') });
      await fanOut.handle(completedEvent(org));

      await breaker.tick();

      expect(receiver.received.map((r) => r.path)).toEqual(['/fine']);
      expect((await deliveriesOf(healthy.id))[0]?.status).toBe('SUCCEEDED');
      expect((await deliveriesOf(broken.id))[0]?.status).toBe('PENDING');
    });
  });

  describe('dispatch', () => {
    it('posts the event signed with the endpoint secret and records success', async () => {
      const org = await database.seedOrganization();
      const endpoint = await database.seedEndpoint(org, {
        url: receiver.url('/ok'),
        consecutiveFailures: 2,
      });
      const event = completedEvent(org);
      await fanOut.handle(event);

      const claimed = await dispatcher.tick();

      expect(claimed).toBe(1);
      const [request] = receiver.received;
      expect(JSON.parse(request?.body ?? '')).toEqual(event);
      expect(request?.headers).toMatchObject({
        'content-type': 'application/json',
        'operantix-event-id': event.eventId,
        'operantix-event-type': 'execution.completed',
      });
      const signature = String(request?.headers['operantix-signature']);
      const [, timestamp, digest] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(signature) ?? [];
      expect(Math.abs(Number(timestamp) - Date.now() / 1000)).toBeLessThan(60);
      expect(digest).toBe(
        createHmac('sha256', endpoint.secret)
          .update(`${String(timestamp)}.${request?.body ?? ''}`)
          .digest('hex'),
      );
      expect(await deliveriesOf(endpoint.id)).toMatchObject([
        { status: 'SUCCEEDED', attempts: 1, last_status_code: 200, last_error_code: null },
      ]);
      expect(await endpointHealth(endpoint.id)).toEqual({
        status: 'ACTIVE',
        consecutive_failures: 0,
      });
      const { rows: attempts } = await database.owner.query(
        `SELECT a.attempt, a.status_code, a.error_code FROM webhook_delivery_attempts a
           JOIN webhook_deliveries d ON d.id = a.delivery_id WHERE d.endpoint_id = $1`,
        [endpoint.id],
      );
      expect(attempts).toEqual([{ attempt: 1, status_code: 200, error_code: null }]);
    });

    it('reschedules a retryable failure with backoff and counts it against the endpoint', async () => {
      const org = await database.seedOrganization();
      const endpoint = await database.seedEndpoint(org, { url: receiver.url('/busy') });
      receiver.statuses.set('/busy', 503);
      await fanOut.handle(completedEvent(org));
      const before = Date.now();

      await dispatcher.tick();

      const [row] = await deliveriesOf(endpoint.id);
      expect(row).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        last_status_code: 503,
        last_error_code: 'HTTP_STATUS',
      });
      expect(row?.next_attempt_at.getTime()).toBeGreaterThanOrEqual(before + 59_000);
      expect(await endpointHealth(endpoint.id)).toEqual({
        status: 'ACTIVE',
        consecutive_failures: 1,
      });
      expect(await dispatcher.tick()).toBe(0); // not due yet
    });

    it('fails after the last attempt', async () => {
      const org = await database.seedOrganization();
      const endpoint = await database.seedEndpoint(org, { url: receiver.url('/down') });
      receiver.statuses.set('/down', 500);
      await fanOut.handle(completedEvent(org));

      for (let attempt = 0; attempt < delivery.maxAttempts; attempt += 1) {
        await dispatcher.tick();
        await elapse();
      }

      expect(await deliveriesOf(endpoint.id)).toMatchObject([
        { status: 'FAILED', attempts: 3, last_status_code: 500 },
      ]);
      expect(receiver.received).toHaveLength(3);
    });

    it('fails at once on a client error', async () => {
      const org = await database.seedOrganization();
      const endpoint = await database.seedEndpoint(org, { url: receiver.url('/gone') });
      receiver.statuses.set('/gone', 410);
      await fanOut.handle(completedEvent(org));

      await dispatcher.tick();

      expect(await deliveriesOf(endpoint.id)).toMatchObject([
        { status: 'FAILED', attempts: 1, last_status_code: 410, last_error_code: 'HTTP_STATUS' },
      ]);
    });

    it('disables an endpoint after repeated failures and stops sending to it', async () => {
      const org = await database.seedOrganization();
      const endpoint = await database.seedEndpoint(org, {
        url: receiver.url('/broken'),
        consecutiveFailures: delivery.disableAfterFailures - 1,
      });
      receiver.statuses.set('/broken', 503);
      await fanOut.handle(completedEvent(org));
      await fanOut.handle(completedEvent(org));

      await dispatcher.tick();

      expect(await endpointHealth(endpoint.id)).toEqual({
        status: 'DISABLED',
        consecutive_failures: delivery.disableAfterFailures,
      });
      // The first failure tripped the breaker; the second delivery is not sent.
      expect(receiver.received).toHaveLength(1);
      const rows = await deliveriesOf(endpoint.id);
      expect(rows.map((r) => r.status).sort()).toEqual(['FAILED', 'FAILED']);
      expect(rows.map((r) => r.last_error_code).sort()).toEqual([
        'ENDPOINT_DISABLED',
        'HTTP_STATUS',
      ]);
    });

    it('refuses a private destination when the policy forbids it', async () => {
      const strict = new WebhookDispatcher(createDatabase(database.integration), {
        delivery,
        http: { ...http, allowPrivateNetworks: false },
        keyring: database.keyring,
      });
      const org = await database.seedOrganization();
      const endpoint = await database.seedEndpoint(org, { url: receiver.url('/private') });
      await fanOut.handle(completedEvent(org));

      await strict.tick();

      expect(receiver.received).toHaveLength(0);
      expect(await deliveriesOf(endpoint.id)).toMatchObject([
        { status: 'FAILED', last_error_code: 'DESTINATION_BLOCKED', last_status_code: null },
      ]);
    });

    it('fails a delivery that a crashing worker claimed too often, without sending it', async () => {
      const org = await database.seedOrganization();
      const endpoint = await database.seedEndpoint(org, { url: receiver.url('/crashy') });
      await fanOut.handle(completedEvent(org));
      // Each crash leaves a claim behind; the lease expired and the row is due again.
      await database.owner.query(
        'UPDATE webhook_deliveries SET attempts = $2 WHERE endpoint_id = $1',
        [endpoint.id, delivery.maxAttempts],
      );

      await dispatcher.tick();

      expect(receiver.received).toHaveLength(0);
      expect(await deliveriesOf(endpoint.id)).toMatchObject([
        { status: 'FAILED', last_error_code: 'MAX_ATTEMPTS_EXCEEDED' },
      ]);
    });

    it('skips a delivery whose endpoint was deleted', async () => {
      const org = await database.seedOrganization();
      const endpoint = await database.seedEndpoint(org, { url: receiver.url('/deleted') });
      await fanOut.handle(completedEvent(org));
      await database.owner.query('DELETE FROM webhook_endpoints WHERE id = $1', [endpoint.id]);

      expect(await dispatcher.tick()).toBe(0);
      expect(receiver.received).toHaveLength(0);
    });
  });
});
