import { createHmac, timingSafeEqual } from 'node:crypto';

/** How far a signed timestamp may be from the server's clock, either way (ADR-0024). */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

const HEX_SHA256 = /^[0-9a-f]{64}$/;

/**
 * Checks an `Operantix-Signature: t=<unix>,v1=<hex>` header against the raw body: the same
 * scheme the platform uses for outbound webhooks. Several `v1` values may be sent; one valid
 * signature is enough. Comparison is constant-time.
 */
export function verifyWebhookSignature(
  header: string | undefined,
  rawBody: Buffer,
  secret: string,
  now: Date,
): boolean {
  if (!header) return false;
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [name, value] = part.trim().split('=', 2);
    if (name === 't') timestamp = value;
    if (name === 'v1' && value !== undefined && HEX_SHA256.test(value)) signatures.push(value);
  }
  if (timestamp === undefined || !/^\d{1,12}$/.test(timestamp) || signatures.length === 0) {
    return false;
  }
  const skew = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));
  if (skew > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
  return signatures
    .map((signature) => timingSafeEqual(expected, Buffer.from(signature, 'hex')))
    .includes(true);
}
