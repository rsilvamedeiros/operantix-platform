import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { KeyringError, parseKeyring, SecretCipher, SecretDecryptionError } from './secret-cipher';

const key = () => randomBytes(32).toString('base64');

describe('parseKeyring', () => {
  it('reads comma-separated id:key pairs, the first being the active key', () => {
    const keyring = parseKeyring(`k2:${key()}, k1:${key()}`);

    expect(keyring.active).toBe('k2');
    expect([...keyring.keys.keys()]).toEqual(['k2', 'k1']);
  });

  it.each([
    ['an empty value', ''],
    ['a pair without an id', `:${key()}`],
    ['a key that is not 32 bytes', `k1:${randomBytes(16).toString('base64')}`],
    ['an id with spaces or symbols', `my key:${key()}`],
    ['a repeated id', `k1:${key()},k1:${key()}`],
  ])('rejects %s without echoing key material', (_, value) => {
    expect(() => parseKeyring(value)).toThrow(KeyringError);
    try {
      parseKeyring(value);
    } catch (error) {
      expect(String(error)).not.toContain(value.split(':')[1] || '#');
    }
  });
});

describe('SecretCipher', () => {
  let cipher: SecretCipher;

  beforeAll(() => {
    cipher = new SecretCipher(parseKeyring(`k1:${key()}`));
  });

  it('round-trips a secret under the same context', () => {
    const sealed = cipher.encrypt('s3cr3t-value', 'org-1/secret-1');

    expect(sealed.keyId).toBe('k1');
    expect(sealed.ciphertext.toString('utf8')).not.toContain('s3cr3t-value');
    expect(cipher.decrypt(sealed, 'org-1/secret-1')).toBe('s3cr3t-value');
  });

  it('uses a fresh nonce each time', () => {
    const a = cipher.encrypt('same', 'ctx');
    const b = cipher.encrypt('same', 'ctx');

    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('refuses a ciphertext moved to another context, such as another tenant', () => {
    const sealed = cipher.encrypt('value', 'org-1/secret-1');

    expect(() => cipher.decrypt(sealed, 'org-2/secret-1')).toThrow(SecretDecryptionError);
  });

  it('refuses a tampered ciphertext', () => {
    const sealed = cipher.encrypt('value', 'ctx');
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;

    expect(() => cipher.decrypt({ ...sealed, ciphertext: tampered }, 'ctx')).toThrow(
      SecretDecryptionError,
    );
  });

  it('refuses a truncated ciphertext', () => {
    expect(() => cipher.decrypt({ keyId: 'k1', ciphertext: Buffer.alloc(10) }, 'ctx')).toThrow(
      SecretDecryptionError,
    );
  });

  it('decrypts with a retired key after rotation, and encrypts with the new one', () => {
    const old = key();
    const before = new SecretCipher(parseKeyring(`k1:${old}`)).encrypt('value', 'ctx');
    const rotated = new SecretCipher(parseKeyring(`k2:${key()},k1:${old}`));

    expect(rotated.decrypt(before, 'ctx')).toBe('value');
    expect(rotated.encrypt('value', 'ctx').keyId).toBe('k2');
  });

  it('names an unknown key id without exposing anything else', () => {
    const sealed = cipher.encrypt('value', 'ctx');

    expect(() => cipher.decrypt({ ...sealed, keyId: 'gone' }, 'ctx')).toThrow(
      new SecretDecryptionError('UNKNOWN_KEY'),
    );
  });
});
