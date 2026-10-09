import { Logger } from '@nestjs/common';
import { observeGauge } from '@operantix/telemetry';
import type { OutboxBacklog } from './outbox/outbox-relay';
import type { QueueBacklog } from './queue/job-queue';

const logger = new Logger('BacklogMetrics');

function logFailure(error: unknown): void {
  logger.warn({
    msg: `Backlog read failed: ${error instanceof Error ? error.message : 'unknown'}`,
  });
}

/**
 * Saturation signals for scaling the worker deployment (docs/operations/autoscaling.md): how
 * many jobs are due and unclaimed, and how long the oldest has waited. Cluster-wide values with
 * no labels, so every replica reports the same numbers.
 */
export function registerQueueGauges(
  queue: { backlog(): Promise<QueueBacklog> },
  onError: (error: unknown) => void = logFailure,
): void {
  observeGauge(
    'operantix.execution.queue.depth',
    { description: 'Execution jobs due and not held by a worker', unit: '{job}' },
    async () => (await queue.backlog()).waiting,
    onError,
  );
  observeGauge(
    'operantix.execution.queue.oldest_age',
    { description: 'Seconds the longest-waiting due job has waited', unit: 's' },
    async () => (await queue.backlog()).oldestWaitingSeconds,
    onError,
  );
}

/** Outbox backlog: events written but not yet acknowledged by the broker. */
export function registerOutboxGauges(
  relay: { backlog(): Promise<OutboxBacklog> },
  onError: (error: unknown) => void = logFailure,
): void {
  observeGauge(
    'operantix.outbox.unpublished',
    { description: 'Outbox events not yet published', unit: '{event}' },
    async () => (await relay.backlog()).unpublished,
    onError,
  );
  observeGauge(
    'operantix.outbox.oldest_age',
    { description: 'Seconds the oldest unpublished outbox event has waited', unit: 's' },
    async () => (await relay.backlog()).oldestUnpublishedSeconds,
    onError,
  );
}
