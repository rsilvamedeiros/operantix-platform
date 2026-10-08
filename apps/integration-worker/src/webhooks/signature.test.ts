import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signWebhook } from './signature';

describe('signWebhook', () => {
  it('signs "<timestamp>.<body>" with HMAC-SHA256 under the endpoint secret', () => {
    const body = '{"eventId":"e-1"}';
    const expected = createHmac('sha256', 'whsec_test').update(`1791460000.${body}`).digest('hex');

    expect(signWebhook('whsec_test', 1791460000, body)).toBe(`t=1791460000,v1=${expected}`);
  });

  it('changes with the timestamp, so a captured signature cannot be replayed later', () => {
    expect(signWebhook('whsec_test', 1, 'body')).not.toBe(signWebhook('whsec_test', 2, 'body'));
  });
});
