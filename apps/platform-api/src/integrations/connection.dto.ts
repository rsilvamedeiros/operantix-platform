import { z } from 'zod';
import type { ConnectionAuthType } from './connections.schema';

const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
// Set by the HTTP client or the worker, or meaningless as a credential.
const RESERVED_HEADERS = new Set([
  'host',
  'content-length',
  'content-type',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'upgrade',
  'te',
  'expect',
  'user-agent',
  'idempotency-key',
]);

const baseUrl = z
  .url({ protocol: /^https?$/ })
  .max(2048)
  .refine((value) => {
    // Runs even when the URL check failed, so it must not assume a parsable URL.
    const url = URL.parse(value);
    return (
      url === null ||
      (url.username === '' && url.password === '' && url.search === '' && url.hash === '')
    );
  }, 'No credentials, query or fragment in the base URL')
  .transform((value) => value.replace(/\/+$/, ''));

const secretValue = z.string().min(1).max(4096);

export const connectionAuthSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('bearer'), token: secretValue }),
  z.strictObject({
    type: z.literal('header'),
    headerName: z
      .string()
      .max(100)
      .regex(HEADER_TOKEN, 'Expected an HTTP header name')
      .transform((name) => name.toLowerCase())
      .refine(
        (name) => !RESERVED_HEADERS.has(name) && !name.startsWith('proxy-'),
        'Reserved header',
      ),
    value: secretValue,
  }),
]);
export type ConnectionAuth = z.output<typeof connectionAuthSchema>;

export const createConnectionSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/, 'Expected a lowercase identifier'),
  baseUrl,
  auth: connectionAuthSchema,
});
export type CreateConnectionInput = z.output<typeof createConnectionSchema>;

export const replaceCredentialSchema = z.object({ auth: connectionAuthSchema });
export type ReplaceCredentialInput = z.output<typeof replaceCredentialSchema>;

/** A connection as the API shows it: never the credential. */
export interface ConnectionView {
  id: string;
  name: string;
  baseUrl: string;
  authType: ConnectionAuthType;
  headerName: string | null;
  createdAt: Date;
  updatedAt: Date;
}
