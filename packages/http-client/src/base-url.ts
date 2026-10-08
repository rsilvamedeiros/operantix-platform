/**
 * Whether `url` may receive a credential bound to `baseUrl` (ADR-0025): same origin (scheme,
 * host and port, as the URL parser normalizes them) and a path equal to or below the base path.
 * `..` segments are resolved by the parser before the comparison, so they cannot climb out.
 */
export function isWithinBaseUrl(url: URL, baseUrl: string): boolean {
  const base = URL.parse(baseUrl);
  if (base === null) return false;
  if (url.username !== '' || url.password !== '') return false;
  if (url.origin !== base.origin) return false;
  const basePath = base.pathname.replace(/\/+$/, '');
  return basePath === '' || url.pathname === basePath || url.pathname.startsWith(`${basePath}/`);
}
