import { createHmac } from 'node:crypto';

/**
 * The `Operantix-Signature` header value: `t=<unix seconds>,v1=<hex HMAC-SHA256>` over
 * `<t>.<body>` with the endpoint's signing secret. Receivers recompute it, compare in constant
 * time and reject old timestamps (docs/integrations/webhooks.md).
 */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  const digest = createHmac('sha256', secret)
    .update(`${String(timestamp)}.${body}`)
    .digest('hex');
  return `t=${String(timestamp)},v1=${digest}`;
}
