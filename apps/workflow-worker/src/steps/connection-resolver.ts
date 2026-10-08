import { type SecretCipher, secretContext } from '@operantix/secrets';
import { sql } from 'drizzle-orm';
import { type Database, withTenant } from '../database';

/** A connection ready to use: where its credential may go and the header that carries it. */
export interface ResolvedConnection {
  baseUrl: string;
  header: { name: string; value: string };
}

export interface ConnectionResolver {
  /** The connection, or undefined when the organization has none with this id. */
  resolve(organizationId: string, connectionId: string): Promise<ResolvedConnection | undefined>;
}

interface ConnectionRow extends Record<string, unknown> {
  base_url: string;
  auth_type: 'bearer' | 'header';
  header_name: string | null;
  secret_id: string;
  key_id: string;
  ciphertext: Buffer;
}

/**
 * Reads a connection and opens its credential (ADR-0025). Runs in the execution's tenant scope,
 * so RLS keeps other organizations' connections out; the worker role can read no secret kind
 * but `CONNECTION_CREDENTIAL`.
 */
export class PostgresConnectionResolver implements ConnectionResolver {
  constructor(
    private readonly db: Database,
    private readonly cipher: SecretCipher,
  ) {}

  async resolve(
    organizationId: string,
    connectionId: string,
  ): Promise<ResolvedConnection | undefined> {
    const { rows } = await withTenant(this.db, organizationId, (tx) =>
      tx.execute<ConnectionRow>(sql`
        SELECT c.base_url, c.auth_type, c.header_name, s.id AS secret_id, s.key_id, s.ciphertext
        FROM connections c
        JOIN secrets s ON s.organization_id = c.organization_id AND s.id = c.credential_secret_id
        WHERE c.id = ${connectionId}`),
    );
    const row = rows[0];
    if (!row) return undefined;
    const credential = this.cipher.decrypt(
      { keyId: row.key_id, ciphertext: row.ciphertext },
      secretContext(organizationId, row.secret_id),
    );
    return {
      baseUrl: row.base_url,
      header:
        row.auth_type === 'bearer'
          ? { name: 'authorization', value: `Bearer ${credential}` }
          : { name: row.header_name ?? '', value: credential },
    };
  }
}
