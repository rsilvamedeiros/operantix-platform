import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { UuidParamPipe } from '../shared/path-params';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import type { TenantContext } from '../tenancy/tenant-context';
import {
  type ExecutionDetailView,
  type ExecutionEventView,
  type ExecutionPage,
  idempotencyKeySchema,
  type ListExecutionsQuery,
  listExecutionsQuerySchema,
  type StartExecutionInput,
  startExecutionSchema,
} from './execution.dto';
import {
  ExecutionNotFoundError,
  ExecutionsService,
  ExecutionWorkflowNotFoundError,
  IdempotencyKeyReusedError,
  InvalidCursorError,
  WorkflowInactiveError,
} from './executions.service';

const workflowNotFound = () =>
  new NotFoundException({ code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' });
const executionNotFound = () =>
  new NotFoundException({ code: 'EXECUTION_NOT_FOUND', message: 'Execution not found' });

/** Maps execution domain errors to HTTP; anything else propagates as a 500. */
function toHttp(error: unknown): unknown {
  if (error instanceof ExecutionWorkflowNotFoundError) return workflowNotFound();
  if (error instanceof ExecutionNotFoundError) return executionNotFound();
  if (error instanceof WorkflowInactiveError) {
    return new ConflictException({
      code: 'WORKFLOW_INACTIVE',
      message: 'Workflow has no active version',
    });
  }
  if (error instanceof IdempotencyKeyReusedError) {
    return new ConflictException({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key was already used with a different request',
    });
  }
  if (error instanceof InvalidCursorError) {
    return new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Query parameters are invalid',
      details: { fields: ['cursor'] },
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

const idempotencyKeyPipe = new ZodValidationPipe(idempotencyKeySchema, 'Headers are invalid');

/** The slice of the platform response the start endpoint needs to answer 200 on replays. */
interface StatusResponse {
  status(code: number): unknown;
}

@Controller('api/v1/organizations/:organizationId')
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @RequirePermission('execution:start')
  @Post('workflows/:workflowId/executions')
  async start(
    @CurrentTenant() tenant: TenantContext,
    @Param('workflowId', new UuidParamPipe(workflowNotFound)) workflowId: string,
    @Headers('idempotency-key') rawIdempotencyKey: unknown,
    @Body(new ZodValidationPipe(startExecutionSchema)) input: StartExecutionInput,
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<ExecutionDetailView> {
    // @Headers takes no pipes, so the header is validated here.
    const idempotencyKey = idempotencyKeyPipe.transform(rawIdempotencyKey);
    const result = await mapped(this.executions.start(tenant, workflowId, input, idempotencyKey));
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result.execution;
  }

  @RequirePermission('execution:read')
  @Get('executions/:executionId')
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('executionId', new UuidParamPipe(executionNotFound)) executionId: string,
  ): Promise<ExecutionDetailView> {
    return mapped(this.executions.get(tenant, executionId));
  }

  @RequirePermission('execution:read')
  @Get('executions/:executionId/timeline')
  timeline(
    @CurrentTenant() tenant: TenantContext,
    @Param('executionId', new UuidParamPipe(executionNotFound)) executionId: string,
  ): Promise<{ data: ExecutionEventView[] }> {
    return mapped(this.executions.timeline(tenant, executionId));
  }

  @RequirePermission('execution:read')
  @Get('workflows/:workflowId/executions')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Param('workflowId', new UuidParamPipe(workflowNotFound)) workflowId: string,
    @Query(new ZodValidationPipe(listExecutionsQuerySchema, 'Query parameters are invalid'))
    query: ListExecutionsQuery,
  ): Promise<ExecutionPage> {
    return mapped(this.executions.list(tenant, workflowId, query));
  }
}
