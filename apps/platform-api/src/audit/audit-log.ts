import type { Transaction } from '../database/database';
import type { TenantContext } from '../tenancy/tenant-context';
import { auditEntries } from './audit.schema';

export interface AuditEvent {
  /** `<resource>.<past-tense verb>`, e.g. `workspace.created`. */
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Records an audit entry in the caller's transaction, so the entry exists if and only if
 * the change it describes was committed.
 */
export async function recordAudit(
  tx: Transaction,
  tenant: TenantContext,
  event: AuditEvent,
): Promise<void> {
  await tx.insert(auditEntries).values({
    organizationId: tenant.organizationId,
    actorUserId: tenant.userId,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    metadata: event.metadata ?? {},
  });
}
