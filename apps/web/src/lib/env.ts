const DEFAULT_API_BASE_URL = 'http://localhost:3000';

/**
 * Where the server side of the web app reaches the Platform API. Server-only on purpose: it is
 * never exposed to the browser bundle (no NEXT_PUBLIC_ prefix). A blank value means unset.
 */
export function apiBaseUrl(env: Record<string, string | undefined>): string {
  const raw = env['API_BASE_URL'];
  if (raw === undefined || raw === '') return DEFAULT_API_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // The value may carry credentials, so the message names the variable only.
    throw new Error('Invalid environment configuration: API_BASE_URL must be an http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Invalid environment configuration: API_BASE_URL must be an http(s) URL');
  }
  return raw.replace(/\/+$/, '');
}
