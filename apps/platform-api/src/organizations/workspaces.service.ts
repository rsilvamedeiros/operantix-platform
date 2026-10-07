import { Inject, Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { recordAudit } from '../audit/audit-log';
import { type Database, isUniqueViolation, withTenant } from '../database/database';
import { DATABASE } from '../database/database.tokens';
import type { TenantContext } from '../tenancy/tenant-context';
import type { CreateWorkspaceInput, WorkspaceView } from './workspace.dto';
import { workspaces } from './organizations.schema';

export class WorkspaceSlugTakenError extends Error {
  override name = 'WorkspaceSlugTakenError';
}

const view = {
  id: workspaces.id,
  name: workspaces.name,
  slug: workspaces.slug,
  createdAt: workspaces.createdAt,
};

@Injectable()
export class WorkspacesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(tenant: TenantContext): Promise<WorkspaceView[]> {
    // No organization filter needed: RLS scopes the query to the tenant.
    return withTenant(this.db, tenant.organizationId, (tx) =>
      tx.select(view).from(workspaces).orderBy(asc(workspaces.createdAt), asc(workspaces.slug)),
    );
  }

  async create(tenant: TenantContext, input: CreateWorkspaceInput): Promise<WorkspaceView> {
    try {
      return await withTenant(this.db, tenant.organizationId, async (tx) => {
        const [created] = await tx
          .insert(workspaces)
          .values({ organizationId: tenant.organizationId, name: input.name, slug: input.slug })
          .returning(view);
        if (!created) throw new Error('Workspace insert returned no row');
        await recordAudit(tx, tenant, {
          action: 'workspace.created',
          resourceType: 'workspace',
          resourceId: created.id,
          metadata: { slug: created.slug },
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new WorkspaceSlugTakenError(input.slug);
      throw error;
    }
  }
}
