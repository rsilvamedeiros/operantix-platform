import { Logger } from '@nestjs/common';
import {
  OutboundHttpClient,
  OutboundHttpError,
  type OutboundHttpOptions,
} from '@operantix/http-client';
import { type Keyring, SecretCipher, secretContext } from '@operantix/secrets';
import { and, eq, sql } from 'drizzle-orm';
import type { DeliveryConfig } from '../config';
import { type Database, withTenant } from '../database';
import {
  secrets,
  webhookDeliveries,
  webhookDeliveryAttempts,
  webhookEndpoints,
} from '../integration.schema';
import { cooldownAfterFailure, decideCircuit } from './circuit-breaker';
import { type AttemptResult, decideOutcome, type DeliveryOutcome } from './delivery-policy';
import { signWebhook } from './signature';

export interface WebhookDispatcherOptions {
  delivery: Omit<DeliveryConfig, 'pollIntervalMs'>;
  http: OutboundHttpOptions;
  keyring: Keyring;
}

interface ClaimedDelivery {
  id: string;
  organizationId: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  /** Claims so far, this one included. */
  attempts: number;
}

type Target =
  | { kind: 'send'; url: URL; secret: string }
  | { kind: 'skip'; errorCode: 'ENDPOINT_DISABLED' | 'SECRET_UNAVAILABLE' }
  /** The endpoint's circuit is open (or another worker is probing it): try again at `until`. */
  | { kind: 'defer'; until: Date };

/** How soon to look again when another worker holds the probe. */
const PROBE_RECHECK_MS = 5_000;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Deliveries due and waiting for a dispatcher, the scaling signal for the worker. */
export interface DeliveryBacklog {
  waiting: number;
  /** Seconds the longest-waiting due delivery has waited; 0 when nothing waits. */
  oldestWaitingSeconds: number;
}

/**
 * Delivers queued webhooks (ADR-0023). Each tick leases due deliveries of any tenant, then for
 * each one: reads the endpoint and opens its signing secret in the delivery's tenant, posts the
 * signed event outside any transaction, and records the attempt, the delivery's next state and
 * the endpoint's health. An endpoint that keeps failing is disabled.
 */
export class WebhookDispatcher {
  private readonly logger = new Logger(WebhookDispatcher.name);
  private readonly client: OutboundHttpClient;
  private readonly cipher: SecretCipher;

  constructor(
    private readonly db: Database,
    private readonly options: WebhookDispatcherOptions,
  ) {
    this.client = new OutboundHttpClient(options.http);
    this.cipher = new SecretCipher(options.keyring);
  }

  /** Claims one batch and delivers it; returns how many deliveries were claimed. */
  async tick(): Promise<number> {
    const claimed = await this.claim();
    for (const delivery of claimed) {
      try {
        await this.deliver(delivery);
      } catch (error) {
        // The lease expires and the delivery is claimed again.
        this.logger.error({
          deliveryId: delivery.id,
          organizationId: delivery.organizationId,
          msg: `Delivery failed unexpectedly: ${message(error)}`,
        });
      }
    }
    return claimed.length;
  }

  /**
   * Due, unleased deliveries across tenants. Deliveries a circuit defers are scheduled for later,
   * so a dead destination does not read as load.
   */
  async backlog(): Promise<DeliveryBacklog> {
    const { rows } = await this.db.execute<{ waiting: string; oldest: number | null }>(sql`
      SELECT count(*) AS waiting,
             extract(epoch FROM now() - min(next_attempt_at))::float8 AS oldest
      FROM webhook_deliveries
      WHERE status = 'PENDING' AND next_attempt_at <= now()
        AND (lease_expires_at IS NULL OR lease_expires_at < now())`);
    return {
      waiting: Number(rows[0]?.waiting ?? 0),
      oldestWaitingSeconds: Math.max(0, rows[0]?.oldest ?? 0),
    };
  }

  private async claim(): Promise<ClaimedDelivery[]> {
    const { rows } = await this.db.execute<{
      id: string;
      organization_id: string;
      endpoint_id: string;
      event_id: string;
      event_type: string;
      payload: unknown;
      attempts: number;
    }>(sql`
      UPDATE webhook_deliveries
      SET lease_expires_at = now() + make_interval(secs => ${this.options.delivery.leaseSeconds}),
          attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM webhook_deliveries
        WHERE status = 'PENDING' AND next_attempt_at <= now()
          AND (lease_expires_at IS NULL OR lease_expires_at < now())
        ORDER BY next_attempt_at
        LIMIT ${this.options.delivery.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, organization_id, endpoint_id, event_id, event_type, payload, attempts`);
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      endpointId: row.endpoint_id,
      eventId: row.event_id,
      eventType: row.event_type,
      payload: row.payload,
      attempts: row.attempts,
    }));
  }

  private async deliver(delivery: ClaimedDelivery): Promise<void> {
    if (delivery.attempts > this.options.delivery.maxAttempts) {
      // Claimed again and again without an attempt being recorded: something about it crashes
      // the worker. Give up instead of crashing forever.
      await this.finish(delivery, { status: 'FAILED', errorCode: 'MAX_ATTEMPTS_EXCEEDED' });
      return;
    }
    const target = await this.target(delivery);
    if (!target) return;
    if (target.kind === 'defer') {
      await this.defer(delivery, target.until);
      return;
    }
    if (target.kind === 'skip') {
      await this.finish(delivery, { status: 'FAILED', errorCode: target.errorCode });
      return;
    }

    const body = JSON.stringify(delivery.payload);
    const started = Date.now();
    const result = await this.send(target, delivery, body);
    const durationMs = Date.now() - started;
    const outcome = decideOutcome(result, delivery.attempts, this.options.delivery, new Date());
    await this.record(delivery, result, outcome, durationMs);
    this.logger.log({
      deliveryId: delivery.id,
      organizationId: delivery.organizationId,
      eventId: delivery.eventId,
      attempt: delivery.attempts,
      outcome: outcome.status,
      ...(result.kind === 'response' ? { statusCode: result.status } : { errorCode: result.code }),
      msg: 'Webhook attempt',
    });
  }

  /** Where to send, read in the delivery's tenant; undefined when the endpoint is gone. */
  private target(delivery: ClaimedDelivery): Promise<Target | undefined> {
    return withTenant(this.db, delivery.organizationId, async (tx) => {
      const [endpoint] = await tx
        .select({
          url: webhookEndpoints.url,
          status: webhookEndpoints.status,
          secretId: webhookEndpoints.signingSecretId,
          consecutiveFailures: webhookEndpoints.consecutiveFailures,
          circuitOpenUntil: webhookEndpoints.circuitOpenUntil,
        })
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, delivery.endpointId));
      if (!endpoint) return undefined;
      if (endpoint.status !== 'ACTIVE') return { kind: 'skip', errorCode: 'ENDPOINT_DISABLED' };
      const { circuit } = this.options.delivery;
      const decision = decideCircuit(
        {
          consecutiveFailures: endpoint.consecutiveFailures,
          openUntil: endpoint.circuitOpenUntil,
        },
        circuit,
        new Date(),
      );
      if (decision.kind === 'defer') return { kind: 'defer', until: decision.until };
      if (decision.kind === 'probe') {
        // Half-open: exactly one delivery probes. Compare-and-set re-opens the circuit for a
        // base cooldown, so concurrent workers see it open; the outcome then closes or extends it.
        const claimed = await tx
          .update(webhookEndpoints)
          .set({ circuitOpenUntil: new Date(Date.now() + circuit.cooldownMs) })
          .where(
            and(
              eq(webhookEndpoints.id, delivery.endpointId),
              sql`${webhookEndpoints.circuitOpenUntil} IS NOT DISTINCT FROM ${endpoint.circuitOpenUntil}`,
            ),
          )
          .returning({ id: webhookEndpoints.id });
        if (claimed.length === 0) {
          return { kind: 'defer', until: new Date(Date.now() + PROBE_RECHECK_MS) };
        }
      }
      const [sealed] = await tx
        .select({ keyId: secrets.keyId, ciphertext: secrets.ciphertext })
        .from(secrets)
        .where(eq(secrets.id, endpoint.secretId));
      if (!sealed) return { kind: 'skip', errorCode: 'SECRET_UNAVAILABLE' };
      try {
        const secret = this.cipher.decrypt(
          sealed,
          secretContext(delivery.organizationId, endpoint.secretId),
        );
        return { kind: 'send', url: new URL(endpoint.url), secret };
      } catch (error) {
        // A missing key or a corrupted row: an operator has to act; retrying will not help.
        this.logger.error({
          deliveryId: delivery.id,
          organizationId: delivery.organizationId,
          msg: `Signing secret unavailable: ${message(error)}`,
        });
        return { kind: 'skip', errorCode: 'SECRET_UNAVAILABLE' };
      }
    });
  }

  private async send(
    target: { url: URL; secret: string },
    delivery: ClaimedDelivery,
    body: string,
  ): Promise<AttemptResult> {
    const timestamp = Math.floor(Date.now() / 1000);
    try {
      const response = await this.client.send({
        method: 'POST',
        url: target.url,
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Operantix-Webhooks/1',
          'operantix-event-id': delivery.eventId,
          'operantix-event-type': delivery.eventType,
          'operantix-delivery-id': delivery.id,
          'operantix-signature': signWebhook(target.secret, timestamp, body),
        },
        body,
      });
      return { kind: 'response', status: response.status };
    } catch (error) {
      if (error instanceof OutboundHttpError) {
        return { kind: 'error', code: error.code, retryable: error.retryable };
      }
      throw error;
    }
  }

  private record(
    delivery: ClaimedDelivery,
    result: AttemptResult,
    decided: DeliveryOutcome,
    durationMs: number,
  ): Promise<void> {
    const statusCode = result.kind === 'response' ? result.status : null;
    return withTenant(this.db, delivery.organizationId, async (tx) => {
      let outcome = decided;
      if (outcome.status === 'SUCCEEDED') {
        await tx
          .update(webhookEndpoints)
          .set({ consecutiveFailures: 0, circuitOpenUntil: null })
          .where(eq(webhookEndpoints.id, delivery.endpointId));
      } else {
        // One statement, so concurrent failures on the same endpoint count correctly.
        const { disableAfterFailures: threshold, circuit } = this.options.delivery;
        const [endpoint] = await tx
          .update(webhookEndpoints)
          .set({
            consecutiveFailures: sql`${webhookEndpoints.consecutiveFailures} + 1`,
            status: sql`CASE WHEN ${webhookEndpoints.consecutiveFailures} + 1 >= ${threshold}
              THEN 'DISABLED' ELSE ${webhookEndpoints.status} END`,
          })
          .where(eq(webhookEndpoints.id, delivery.endpointId))
          .returning({
            status: webhookEndpoints.status,
            consecutiveFailures: webhookEndpoints.consecutiveFailures,
          });
        if (endpoint) {
          const openUntil = cooldownAfterFailure(endpoint.consecutiveFailures, circuit, new Date());
          if (openUntil) {
            await tx
              .update(webhookEndpoints)
              .set({ circuitOpenUntil: openUntil })
              .where(eq(webhookEndpoints.id, delivery.endpointId));
          }
        }
        // A retry to an endpoint this failure just disabled would only fail again.
        if (endpoint?.status === 'DISABLED') {
          outcome = { status: 'FAILED', errorCode: outcome.errorCode };
        }
      }
      await tx.insert(webhookDeliveryAttempts).values({
        organizationId: delivery.organizationId,
        deliveryId: delivery.id,
        attempt: delivery.attempts,
        statusCode,
        errorCode: outcome.status === 'SUCCEEDED' ? null : outcome.errorCode,
        durationMs,
      });
      await tx
        .update(webhookDeliveries)
        .set({
          status: outcome.status,
          nextAttemptAt: outcome.status === 'PENDING' ? outcome.nextAttemptAt : undefined,
          leaseExpiresAt: null,
          lastStatusCode: statusCode,
          lastErrorCode: outcome.status === 'SUCCEEDED' ? null : outcome.errorCode,
          completedAt: outcome.status === 'PENDING' ? null : new Date(),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
    });
  }

  /** Puts a delivery back, untouched, until the endpoint's circuit may close. */
  private defer(delivery: ClaimedDelivery, until: Date): Promise<void> {
    return withTenant(this.db, delivery.organizationId, async (tx) => {
      await tx
        .update(webhookDeliveries)
        .set({
          // The claim counted an attempt that never happened.
          attempts: sql`${webhookDeliveries.attempts} - 1`,
          nextAttemptAt: until,
          leaseExpiresAt: null,
        })
        .where(eq(webhookDeliveries.id, delivery.id));
    });
  }

  /** Ends a delivery that was not attempted. */
  private finish(
    delivery: ClaimedDelivery,
    outcome: { status: 'FAILED'; errorCode: string },
  ): Promise<void> {
    return withTenant(this.db, delivery.organizationId, async (tx) => {
      await tx
        .update(webhookDeliveries)
        .set({
          status: outcome.status,
          leaseExpiresAt: null,
          lastErrorCode: outcome.errorCode,
          completedAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
    });
  }
}
