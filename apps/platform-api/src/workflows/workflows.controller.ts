import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { StepConnectionError } from '../integrations/step-connections';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { PositiveIntParamPipe, UuidParamPipe } from '../shared/path-params';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import type { TenantContext } from '../tenancy/tenant-context';
import {
  type ActivateWorkflowInput,
  activateWorkflowSchema,
  type CreateWorkflowInput,
  createWorkflowSchema,
  type CreateWorkflowVersionInput,
  createWorkflowVersionSchema,
  type WorkflowDetailView,
  type WorkflowVersionView,
  type WorkflowView,
} from './workflow.dto';
import {
  WorkflowKeyTakenError,
  WorkflowNotFoundError,
  WorkflowsService,
  WorkflowVersionNotFoundError,
  WorkspaceNotFoundError,
} from './workflows.service';

const workspaceNotFound = () =>
  new NotFoundException({ code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' });
const workflowNotFound = () =>
  new NotFoundException({ code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' });
const versionNotFound = () =>
  new NotFoundException({
    code: 'WORKFLOW_VERSION_NOT_FOUND',
    message: 'Workflow version not found',
  });

/** Maps workflow domain errors to HTTP; anything else propagates as a 500. */
function toHttp(error: unknown): unknown {
  if (error instanceof WorkspaceNotFoundError) return workspaceNotFound();
  if (error instanceof WorkflowNotFoundError) return workflowNotFound();
  if (error instanceof WorkflowVersionNotFoundError) return versionNotFound();
  if (error instanceof StepConnectionError) {
    return new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request body is invalid',
      details: { fields: error.fields.map((field) => `definition.${field}`) },
    });
  }
  if (error instanceof WorkflowKeyTakenError) {
    return new ConflictException({
      code: 'WORKFLOW_KEY_TAKEN',
      message: 'Workflow key already in use in this workspace',
    });
  }
  return error;
}

async function mapped<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    throw toHttp(error);
  }
}

@Controller('api/v1/organizations/:organizationId')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @RequirePermission('workflow:read')
  @Get('workspaces/:workspaceId/workflows')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Param('workspaceId', new UuidParamPipe(workspaceNotFound)) workspaceId: string,
  ): Promise<{ data: WorkflowView[] }> {
    return { data: await mapped(this.workflows.list(tenant, workspaceId)) };
  }

  @RequirePermission('workflow:write')
  @Post('workspaces/:workspaceId/workflows')
  create(
    @CurrentTenant() tenant: TenantContext,
    @Param('workspaceId', new UuidParamPipe(workspaceNotFound)) workspaceId: string,
    @Body(new ZodValidationPipe(createWorkflowSchema)) input: CreateWorkflowInput,
  ): Promise<WorkflowView> {
    return mapped(this.workflows.create(tenant, workspaceId, input));
  }

  @RequirePermission('workflow:read')
  @Get('workflows/:workflowId')
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('workflowId', new UuidParamPipe(workflowNotFound)) workflowId: string,
  ): Promise<WorkflowDetailView> {
    return mapped(this.workflows.get(tenant, workflowId));
  }

  @RequirePermission('workflow:write')
  @Post('workflows/:workflowId/versions')
  addVersion(
    @CurrentTenant() tenant: TenantContext,
    @Param('workflowId', new UuidParamPipe(workflowNotFound)) workflowId: string,
    @Body(new ZodValidationPipe(createWorkflowVersionSchema)) input: CreateWorkflowVersionInput,
  ): Promise<WorkflowVersionView> {
    return mapped(this.workflows.addVersion(tenant, workflowId, input.definition));
  }

  @RequirePermission('workflow:activate')
  @Put('workflows/:workflowId/activation')
  activate(
    @CurrentTenant() tenant: TenantContext,
    @Param('workflowId', new UuidParamPipe(workflowNotFound)) workflowId: string,
    @Body(new ZodValidationPipe(activateWorkflowSchema)) input: ActivateWorkflowInput,
  ): Promise<WorkflowView> {
    return mapped(this.workflows.activate(tenant, workflowId, input.version));
  }

  @RequirePermission('workflow:activate')
  @Delete('workflows/:workflowId/activation')
  deactivate(
    @CurrentTenant() tenant: TenantContext,
    @Param('workflowId', new UuidParamPipe(workflowNotFound)) workflowId: string,
  ): Promise<WorkflowView> {
    return mapped(this.workflows.deactivate(tenant, workflowId));
  }

  @RequirePermission('workflow:read')
  @Get('workflows/:workflowId/versions/:version')
  getVersion(
    @CurrentTenant() tenant: TenantContext,
    @Param('workflowId', new UuidParamPipe(workflowNotFound)) workflowId: string,
    @Param('version', new PositiveIntParamPipe(versionNotFound)) version: number,
  ): Promise<WorkflowVersionView> {
    return mapped(this.workflows.getVersion(tenant, workflowId, version));
  }
}
