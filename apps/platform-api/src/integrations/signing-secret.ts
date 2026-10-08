import { randomBytes } from 'node:crypto';

/** 32 random bytes; the prefix makes a leaked secret easy to recognize and scan for. */
export function newSigningSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}
