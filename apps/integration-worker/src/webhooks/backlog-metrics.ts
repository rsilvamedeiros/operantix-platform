import { Logger } from '@nestjs/common';
import { observeGauge } from '@operantix/telemetry';
import type { DeliveryBacklog } from './webhook-dispatcher';

const logger = new Logger('BacklogMetrics');

function logFailure(error: unknown): void {
  logger.warn({
    msg: `Backlog read failed: ${error instanceof Error ? error.message : 'unknown'}`,
  });
}

/**
 * Saturation signals for scaling the integration worker (docs/operations/autoscaling.md): the
 * deliveries due and unclaimed, and how long the oldest has waited. Cluster-wide, no labels.
 */
export function registerDeliveryGauges(
  dispatcher: { backlog(): Promise<DeliveryBacklog> },
  onError: (error: unknown) => void = logFailure,
): void {
  observeGauge(
    'operantix.webhook.queue.depth',
    { description: 'Webhook deliveries due and not held by a dispatcher', unit: '{delivery}' },
    async () => (await dispatcher.backlog()).waiting,
    onError,
  );
  observeGauge(
    'operantix.webhook.queue.oldest_age',
    { description: 'Seconds the longest-waiting due delivery has waited', unit: 's' },
    async () => (await dispatcher.backlog()).oldestWaitingSeconds,
    onError,
  );
}
