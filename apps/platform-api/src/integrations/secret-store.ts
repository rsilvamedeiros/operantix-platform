import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SecretCipher, secretContext } from '@operantix/secrets';
import { eq } from 'drizzle-orm';
import type { Transaction } from '../database/database';
import { type SecretKind, secrets } from './secrets.schema';

export const SECRET_CIPHER = Symbol('SECRET_CIPHER');

/**
 * Stores secrets as references (ADR-0022): callers keep the returned id, never the value. The
 * API only seals; workloads that use a secret open it with the same keyring.
 */
@Injectable()
export class SecretStore {
  constructor(@Inject(SECRET_CIPHER) private readonly cipher: SecretCipher) {}

  /** Seals `value` in the caller's tenant transaction and returns the new secret's id. */
  async create(
    tx: Transaction,
    organizationId: string,
    kind: SecretKind,
    value: string,
  ): Promise<string> {
    const id = randomUUID();
    const sealed = this.cipher.encrypt(value, secretContext(organizationId, id));
    await tx.insert(secrets).values({
      id,
      organizationId,
      kind,
      keyId: sealed.keyId,
      ciphertext: sealed.ciphertext,
    });
    return id;
  }

  async remove(tx: Transaction, id: string): Promise<void> {
    await tx.delete(secrets).where(eq(secrets.id, id));
  }
}
