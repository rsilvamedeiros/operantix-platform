import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../audit/audit-log';
import {
  type Database,
  isUniqueViolation,
  type Transaction,
  withTenant,
} from '../database/database';
import { DATABASE } from '../database/database.tokens';
import type { TenantContext } from '../tenancy/tenant-context';
import type {
  ConnectionAuth,
  ConnectionView,
  CreateConnectionInput,
  ReplaceCredentialInput,
} from './connection.dto';
import { connections } from './connections.schema';
import { SecretStore } from './secret-store';

export class ConnectionNotFoundError extends Error {
  override name = 'ConnectionNotFoundError';
}
export class ConnectionNameTakenError extends Error {
  override name = 'ConnectionNameTakenError';
}

const connectionView = {
  id: connections.id,
  name: connections.name,
  baseUrl: connections.baseUrl,
  authType: connections.authType,
  headerName: connections.headerName,
  createdAt: connections.createdAt,
  updatedAt: connections.updatedAt,
};

/** The non-secret half of the auth settings; the secret half goes to the secret store. */
function split(auth: ConnectionAuth): { headerName: string | null; secret: string } {
  return auth.type === 'bearer'
    ? { headerName: null, secret: auth.token }
    : { headerName: auth.headerName, secret: auth.value };
}

// All queries run under the tenant's RLS scope; ids of other tenants simply match nothing.
@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly secrets: SecretStore,
  ) {}

  list(tenant: TenantContext): Promise<ConnectionView[]> {
    return withTenant(this.db, tenant.organizationId, (tx) =>
      tx.select(connectionView).from(connections).orderBy(asc(connections.name)),
    );
  }

  get(tenant: TenantContext, connectionId: string): Promise<ConnectionView> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const [connection] = await tx
        .select(connectionView)
        .from(connections)
        .where(eq(connections.id, connectionId));
      if (!connection) throw new ConnectionNotFoundError(connectionId);
      return connection;
    });
  }

  async create(tenant: TenantContext, input: CreateConnectionInput): Promise<ConnectionView> {
    const { headerName, secret } = split(input.auth);
    try {
      return await withTenant(this.db, tenant.organizationId, async (tx) => {
        const secretId = await this.secrets.create(
          tx,
          tenant.organizationId,
          'CONNECTION_CREDENTIAL',
          secret,
        );
        const [created] = await tx
          .insert(connections)
          .values({
            organizationId: tenant.organizationId,
            name: input.name,
            baseUrl: input.baseUrl,
            authType: input.auth.type,
            headerName,
            credentialSecretId: secretId,
          })
          .returning(connectionView);
        if (!created) throw new Error('Connection insert returned no row');
        await recordAudit(tx, tenant, {
          action: 'connection.created',
          resourceType: 'connection',
          resourceId: created.id,
          metadata: { name: created.name, baseUrl: created.baseUrl, authType: created.authType },
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConnectionNameTakenError(input.name);
      throw error;
    }
  }

  /** Seals the new credential and deletes the old one in the same transaction. */
  replaceCredential(
    tenant: TenantContext,
    connectionId: string,
    input: ReplaceCredentialInput,
  ): Promise<ConnectionView> {
    const { headerName, secret } = split(input.auth);
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const previous = await lockSecretId(tx, connectionId);
      const secretId = await this.secrets.create(
        tx,
        tenant.organizationId,
        'CONNECTION_CREDENTIAL',
        secret,
      );
      const [updated] = await tx
        .update(connections)
        .set({
          authType: input.auth.type,
          headerName,
          credentialSecretId: secretId,
          updatedAt: sql`now()`,
        })
        .where(eq(connections.id, connectionId))
        .returning(connectionView);
      if (!updated) throw new ConnectionNotFoundError(connectionId);
      await this.secrets.remove(tx, previous);
      await recordAudit(tx, tenant, {
        action: 'connection.credential_replaced',
        resourceType: 'connection',
        resourceId: connectionId,
        metadata: { authType: updated.authType },
      });
      return updated;
    });
  }

  remove(tenant: TenantContext, connectionId: string): Promise<void> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const [deleted] = await tx
        .delete(connections)
        .where(eq(connections.id, connectionId))
        .returning({ name: connections.name, secretId: connections.credentialSecretId });
      if (!deleted) throw new ConnectionNotFoundError(connectionId);
      await this.secrets.remove(tx, deleted.secretId);
      await recordAudit(tx, tenant, {
        action: 'connection.deleted',
        resourceType: 'connection',
        resourceId: connectionId,
        metadata: { name: deleted.name },
      });
    });
  }
}

async function lockSecretId(tx: Transaction, connectionId: string): Promise<string> {
  const [connection] = await tx
    .select({ secretId: connections.credentialSecretId })
    .from(connections)
    .where(eq(connections.id, connectionId))
    .for('update');
  if (!connection) throw new ConnectionNotFoundError(connectionId);
  return connection.secretId;
}
