import { Body, ConflictException, Controller, Get, Post } from '@nestjs/common';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import type { TenantContext } from '../tenancy/tenant-context';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import {
  type CreateWorkspaceInput,
  createWorkspaceSchema,
  type WorkspaceView,
} from './workspace.dto';
import { WorkspacesService, WorkspaceSlugTakenError } from './workspaces.service';

@Controller('v1/organizations/:organizationId/workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @RequirePermission('workspace:read')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext): Promise<{ data: WorkspaceView[] }> {
    return { data: await this.workspaces.list(tenant) };
  }

  @RequirePermission('workspace:create')
  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createWorkspaceSchema)) input: CreateWorkspaceInput,
  ): Promise<WorkspaceView> {
    try {
      return await this.workspaces.create(tenant, input);
    } catch (error) {
      if (error instanceof WorkspaceSlugTakenError) {
        throw new ConflictException({
          code: 'WORKSPACE_SLUG_TAKEN',
          message: 'Workspace slug already in use',
        });
      }
      throw error;
    }
  }
}
