import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../audit/audit-log';
import {
  type Database,
  isUniqueViolation,
  type Transaction,
  withTenant,
} from '../database/database';
import { DATABASE } from '../database/database.tokens';
import { workspaces } from '../organizations/organizations.schema';
import type { TenantContext } from '../tenancy/tenant-context';
import type { WorkflowDefinition } from './workflow-definition';
import type {
  CreateWorkflowInput,
  WorkflowDetailView,
  WorkflowVersionView,
  WorkflowView,
} from './workflow.dto';
import { workflows, workflowVersions } from './workflows.schema';

export class WorkspaceNotFoundError extends Error {
  override name = 'WorkspaceNotFoundError';
}
export class WorkflowNotFoundError extends Error {
  override name = 'WorkflowNotFoundError';
}
export class WorkflowVersionNotFoundError extends Error {
  override name = 'WorkflowVersionNotFoundError';
}
export class WorkflowKeyTakenError extends Error {
  override name = 'WorkflowKeyTakenError';
}

const workflowView = {
  id: workflows.id,
  workspaceId: workflows.workspaceId,
  name: workflows.name,
  key: workflows.key,
  latestVersion: workflows.latestVersion,
  activeVersion: workflows.activeVersion,
  createdAt: workflows.createdAt,
};

const versionView = {
  workflowId: workflowVersions.workflowId,
  version: workflowVersions.version,
  definition: workflowVersions.definition,
  createdBy: workflowVersions.createdBy,
  createdAt: workflowVersions.createdAt,
};

// All queries run under the tenant's RLS scope; ids of other tenants simply match nothing.
@Injectable()
export class WorkflowsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(tenant: TenantContext, workspaceId: string): Promise<WorkflowView[]> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      await requireWorkspace(tx, workspaceId);
      return tx
        .select(workflowView)
        .from(workflows)
        .where(eq(workflows.workspaceId, workspaceId))
        .orderBy(asc(workflows.key));
    });
  }

  async create(
    tenant: TenantContext,
    workspaceId: string,
    input: CreateWorkflowInput,
  ): Promise<WorkflowView> {
    try {
      return await withTenant(this.db, tenant.organizationId, async (tx) => {
        await requireWorkspace(tx, workspaceId);
        const [created] = await tx
          .insert(workflows)
          .values({
            organizationId: tenant.organizationId,
            workspaceId,
            key: input.key,
            name: input.name,
          })
          .returning(workflowView);
        if (!created) throw new Error('Workflow insert returned no row');
        await insertVersion(tx, tenant, created.id, 1, input.definition);
        await recordAudit(tx, tenant, {
          action: 'workflow.created',
          resourceType: 'workflow',
          resourceId: created.id,
          metadata: { key: created.key, version: 1 },
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new WorkflowKeyTakenError(input.key);
      throw error;
    }
  }

  get(tenant: TenantContext, workflowId: string): Promise<WorkflowDetailView> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const [workflow] = await tx
        .select(workflowView)
        .from(workflows)
        .where(eq(workflows.id, workflowId));
      if (!workflow) throw new WorkflowNotFoundError(workflowId);
      const versions = await tx
        .select({
          version: workflowVersions.version,
          createdBy: workflowVersions.createdBy,
          createdAt: workflowVersions.createdAt,
        })
        .from(workflowVersions)
        .where(eq(workflowVersions.workflowId, workflowId))
        .orderBy(desc(workflowVersions.version));
      return { ...workflow, versions };
    });
  }

  addVersion(
    tenant: TenantContext,
    workflowId: string,
    definition: WorkflowDefinition,
  ): Promise<WorkflowVersionView> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      // The UPDATE locks the workflow row, so concurrent writers queue and each gets its own number.
      const [bumped] = await tx
        .update(workflows)
        .set({ latestVersion: sql`${workflows.latestVersion} + 1` })
        .where(eq(workflows.id, workflowId))
        .returning({ version: workflows.latestVersion });
      if (!bumped) throw new WorkflowNotFoundError(workflowId);
      const created = await insertVersion(tx, tenant, workflowId, bumped.version, definition);
      await recordAudit(tx, tenant, {
        action: 'workflow.version_created',
        resourceType: 'workflow',
        resourceId: workflowId,
        metadata: { version: bumped.version },
      });
      return created;
    });
  }

  getVersion(
    tenant: TenantContext,
    workflowId: string,
    version: number,
  ): Promise<WorkflowVersionView> {
    return withTenant(this.db, tenant.organizationId, async (tx) => {
      const [found] = await tx
        .select(versionView)
        .from(workflowVersions)
        .where(
          and(eq(workflowVersions.workflowId, workflowId), eq(workflowVersions.version, version)),
        );
      if (!found) throw new WorkflowVersionNotFoundError(`${workflowId}@${String(version)}`);
      return found;
    });
  }
}

async function requireWorkspace(tx: Transaction, workspaceId: string): Promise<void> {
  const [workspace] = await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  if (!workspace) throw new WorkspaceNotFoundError(workspaceId);
}

async function insertVersion(
  tx: Transaction,
  tenant: TenantContext,
  workflowId: string,
  version: number,
  definition: WorkflowDefinition,
): Promise<WorkflowVersionView> {
  const [created] = await tx
    .insert(workflowVersions)
    .values({
      organizationId: tenant.organizationId,
      workflowId,
      version,
      definition,
      createdBy: tenant.userId,
    })
    .returning(versionView);
  if (!created) throw new Error('Workflow version insert returned no row');
  return created;
}
