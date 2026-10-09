import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('next config', () => {
  it('transpiles the shared UI package', () => {
    expect(nextConfig.transpilePackages).toContain('@operantix/ui');
  });

  it('does not advertise the framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('sets browser hardening headers on every route', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.find((rule) => rule.source === '/(.*)');
    const headers = Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]));

    expect(headers).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
  });
});
