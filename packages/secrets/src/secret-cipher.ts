export class KeyringError extends Error {}
export class SecretDecryptionError extends Error {}
export interface Keyring {
  active: string;
  keys: Map<string, Buffer>;
}
export function parseKeyring(_value: string): Keyring {
  throw new Error('not implemented');
}
export class SecretCipher {
  constructor(_keyring: Keyring) {}
  encrypt(_plaintext: string, _context: string): { keyId: string; ciphertext: Buffer } {
    throw new Error('not implemented');
  }
  decrypt(_sealed: { keyId: string; ciphertext: Buffer }, _context: string): string {
    throw new Error('not implemented');
  }
}
