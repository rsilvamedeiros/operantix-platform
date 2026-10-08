import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, includes cloud metadata endpoints
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes broadcast
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128],
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/**
 * Whether outbound requests to `address` must be refused (docs/security: SSRF). Covers
 * loopback, private, link-local (cloud metadata), CGNAT, multicast and reserved ranges.
 * Anything that is not an IP literal is refused: callers check resolved addresses.
 */
export function isBlockedAddress(address: string): boolean {
  const mapped = IPV4_MAPPED.exec(address)?.[1];
  if (mapped) return isBlockedAddress(mapped);
  const family = isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) return blocked.check(address, 'ipv6');
  return true;
}
