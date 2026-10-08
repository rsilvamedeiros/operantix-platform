import { EVENT_TYPES } from '@operantix/contracts';
import { z } from 'zod';
import { type WebhookEndpointStatus, webhookEndpointStatuses } from './webhook-endpoints.schema';

const endpointUrl = z
  .url({ protocol: /^https?$/ })
  .max(2048)
  .refine((value) => {
    // Runs even when the URL check failed, so it must not assume a parsable URL.
    const url = URL.parse(value);
    return url === null || (url.username === '' && url.password === '');
  }, 'Credentials do not belong in the URL');

export const createWebhookEndpointSchema = z.object({
  url: endpointUrl,
  eventTypes: z
    .array(z.enum(EVENT_TYPES))
    .min(1)
    .refine((types) => new Set(types).size === types.length, 'Event types must be unique'),
  description: z.string().trim().min(1).max(200).optional(),
});
export type CreateWebhookEndpointInput = z.output<typeof createWebhookEndpointSchema>;

export const setWebhookEndpointStatusSchema = z.object({ status: z.enum(webhookEndpointStatuses) });
export type SetWebhookEndpointStatusInput = z.output<typeof setWebhookEndpointStatusSchema>;

export interface WebhookEndpointView {
  id: string;
  url: string;
  description: string | null;
  eventTypes: string[];
  status: WebhookEndpointStatus;
  /** Failed deliveries in a row; the worker disables the endpoint at its threshold. */
  consecutiveFailures: number;
  createdAt: Date;
}

/** Returned only when a secret is created or rotated; it cannot be read back afterwards. */
export interface WebhookEndpointWithSecretView extends WebhookEndpointView {
  signingSecret: string;
}
