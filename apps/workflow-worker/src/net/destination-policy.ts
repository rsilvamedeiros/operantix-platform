/**
 * Whether outbound requests to `address` must be refused (docs/security: SSRF). Covers
 * loopback, private, link-local (cloud metadata), CGNAT, multicast and reserved ranges.
 */
export function isBlockedAddress(_address: string): boolean {
  throw new Error('not implemented');
}
