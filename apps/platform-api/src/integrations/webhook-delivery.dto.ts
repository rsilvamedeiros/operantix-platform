import { z } from 'zod';
import type { WebhookDeliveryStatus } from './webhook-deliveries.schema';

export const listWebhookDeliveriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type ListWebhookDeliveriesQuery = z.output<typeof listWebhookDeliveriesQuerySchema>;

/** A delivery without its payload, which is the event the subscriber already receives. */
export interface WebhookDeliveryView {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastStatusCode: number | null;
  lastErrorCode: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface WebhookDeliveryPage {
  data: WebhookDeliveryView[];
  nextCursor: string | null;
}

export interface WebhookDeliveryAttemptView {
  attempt: number;
  statusCode: number | null;
  errorCode: string | null;
  durationMs: number;
  attemptedAt: Date;
}

export interface WebhookDeliveryDetailView extends WebhookDeliveryView {
  attemptHistory: WebhookDeliveryAttemptView[];
}
