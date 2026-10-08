import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID = /^[a-z0-9-]{1,32}$/;

/** A configuration problem with the keyring. Messages name the entry, never key material. */
export class KeyringError extends Error {
  override name = 'KeyringError';
}

export type DecryptionFailure = 'UNKNOWN_KEY' | 'INVALID_CIPHERTEXT';

/** A stored secret that cannot be opened: the key is gone, or the ciphertext or context is wrong. */
export class SecretDecryptionError extends Error {
  override name = 'SecretDecryptionError';

  constructor(readonly reason: DecryptionFailure) {
    super(reason);
  }
}

export interface Keyring {
  /** The key new secrets are encrypted with. */
  active: string;
  /** Every key that can still decrypt, by id. */
  keys: ReadonlyMap<string, Buffer>;
}

/** A secret as stored: the id of the key that sealed it and nonce ‖ tag ‖ ciphertext. */
export interface SealedSecret {
  keyId: string;
  ciphertext: Buffer;
}

/**
 * Parses `id:base64key[,id:base64key...]`. The first key is active; the others only decrypt,
 * which lets a key be rotated without re-encrypting every secret at once (ADR-0022).
 */
export function parseKeyring(value: string): Keyring {
  const keys = new Map<string, Buffer>();
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  for (const [index, entry] of entries.entries()) {
    const separator = entry.indexOf(':');
    const id = separator === -1 ? '' : entry.slice(0, separator);
    if (!KEY_ID.test(id)) {
      throw new KeyringError(`Keyring entry ${String(index + 1)} needs an id of [a-z0-9-]`);
    }
    if (keys.has(id)) throw new KeyringError(`Keyring id "${id}" is repeated`);
    const key = Buffer.from(entry.slice(separator + 1), 'base64');
    if (key.length !== KEY_BYTES) {
      throw new KeyringError(`Keyring key "${id}" must be ${String(KEY_BYTES)} bytes in base64`);
    }
    keys.set(id, key);
  }
  const [active] = keys.keys();
  if (active === undefined) throw new KeyringError('Keyring has no keys');
  return { active, keys };
}

/**
 * AES-256-GCM with a fresh nonce per secret. The context (for example the owning organization
 * and the secret's id) is bound as additional data, so a ciphertext copied to another row or
 * tenant fails to decrypt.
 */
export class SecretCipher {
  constructor(private readonly keyring: Keyring) {}

  encrypt(plaintext: string, context: string): SealedSecret {
    const keyId = this.keyring.active;
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key(keyId), nonce, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { keyId, ciphertext: Buffer.concat([nonce, cipher.getAuthTag(), body]) };
  }

  decrypt(sealed: SealedSecret, context: string): string {
    const key = this.keyring.keys.get(sealed.keyId);
    if (!key) throw new SecretDecryptionError('UNKNOWN_KEY');
    if (sealed.ciphertext.length < NONCE_BYTES + TAG_BYTES) {
      throw new SecretDecryptionError('INVALID_CIPHERTEXT');
    }
    const nonce = sealed.ciphertext.subarray(0, NONCE_BYTES);
    const tag = sealed.ciphertext.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
    const body = sealed.ciphertext.subarray(NONCE_BYTES + TAG_BYTES);
    try {
      const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    } catch {
      // OpenSSL's message says nothing useful; the reason is the whole diagnosis.
      throw new SecretDecryptionError('INVALID_CIPHERTEXT');
    }
  }

  private key(id: string): Buffer {
    const key = this.keyring.keys.get(id);
    if (!key) throw new KeyringError(`Active key "${id}" is missing`);
    return key;
  }
}
