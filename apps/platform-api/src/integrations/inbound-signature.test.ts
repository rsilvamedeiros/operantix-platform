import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from './inbound-signature';

const SECRET = 'whsec_test';
const NOW = new Date('2026-10-08T12:00:00Z');
const AT = Math.floor(NOW.getTime() / 1000);
const BODY = Buffer.from('{"a":1}');

const v1 = (at: number, body: Buffer, secret = SECRET) =>
  createHmac('sha256', secret)
    .update(`${String(at)}.`)
    .update(body)
    .digest('hex');

describe('verifyWebhookSignature', () => {
  it('accepts a signature over the raw body within the window', () => {
    expect(verifyWebhookSignature(`t=${String(AT)},v1=${v1(AT, BODY)}`, BODY, SECRET, NOW)).toBe(
      true,
    );
  });

  it('accepts timestamps up to five minutes either way', () => {
    for (const at of [AT - 300, AT + 300]) {
      expect(verifyWebhookSignature(`t=${String(at)},v1=${v1(at, BODY)}`, BODY, SECRET, NOW)).toBe(
        true,
      );
    }
  });

  it('accepts one valid signature among several', () => {
    const header = `t=${String(AT)},v1=${'0'.repeat(64)},v1=${v1(AT, BODY)}`;

    expect(verifyWebhookSignature(header, BODY, SECRET, NOW)).toBe(true);
  });

  it.each([
    ['a missing header', undefined],
    ['an empty header', ''],
    ['no timestamp', `v1=${v1(AT, BODY)}`],
    ['no signature', `t=${String(AT)}`],
    ['a non-numeric timestamp', `t=soon,v1=${v1(AT, BODY)}`],
    ['a stale timestamp', `t=${String(AT - 301)},v1=${v1(AT - 301, BODY)}`],
    ['a future timestamp', `t=${String(AT + 301)},v1=${v1(AT + 301, BODY)}`],
    ['another secret', `t=${String(AT)},v1=${v1(AT, BODY, 'whsec_other')}`],
    ['another body', `t=${String(AT)},v1=${v1(AT, Buffer.from('{"a":2}'))}`],
    ['a truncated signature', `t=${String(AT)},v1=${v1(AT, BODY).slice(0, 10)}`],
    ['a non-hex signature', `t=${String(AT)},v1=${'z'.repeat(64)}`],
  ])('rejects %s', (_, header) => {
    expect(verifyWebhookSignature(header, BODY, SECRET, NOW)).toBe(false);
  });
});
