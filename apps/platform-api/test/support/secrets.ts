import { randomBytes } from 'node:crypto';
import { type Keyring, parseKeyring } from '@operantix/secrets';

/** A keyring with one random key, generated per run so no key material lives in the repo. */
export function testKeyring(): Keyring {
  return parseKeyring(`test:${randomBytes(32).toString('base64')}`);
}
