import { z } from 'zod';

export const createInboundWebhookSchema = z.object({
  workflowId: z.uuid(),
  description: z.string().trim().min(1).max(200).optional(),
});
export type CreateInboundWebhookInput = z.output<typeof createInboundWebhookSchema>;

/** Required on every inbound delivery; scoped to the webhook (ADR-0024). */
export const inboundIdempotencyKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\x21-\x7e]+$/, 'Printable ASCII without spaces');

/** The payload becomes the execution input, so it must be a JSON object. */
export const inboundPayloadSchema = z.record(z.string(), z.unknown());

export interface InboundWebhookView {
  id: string;
  workflowId: string;
  description: string | null;
  /** Where senders POST, relative to the API's public origin. */
  path: string;
  createdAt: Date;
}

/** Returned only when a secret is created or rotated; it cannot be read back afterwards. */
export interface InboundWebhookWithSecretView extends InboundWebhookView {
  signingSecret: string;
}

export interface InboundDeliveryAccepted {
  executionId: string;
}
