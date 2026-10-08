import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { UuidParamPipe } from '../shared/path-params';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import type { TenantContext } from '../tenancy/tenant-context';
import {
  type ConnectionView,
  type CreateConnectionInput,
  createConnectionSchema,
  type ReplaceCredentialInput,
  replaceCredentialSchema,
} from './connection.dto';
import {
  ConnectionInUseError,
  ConnectionNameTakenError,
  ConnectionNotFoundError,
  ConnectionsService,
} from './connections.service';

const connectionNotFound = () =>
  new NotFoundException({ code: 'CONNECTION_NOT_FOUND', message: 'Connection not found' });

/** Maps connection domain errors to HTTP; anything else propagates as a 500. */
async function mapped<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof ConnectionNotFoundError) throw connectionNotFound();
    if (error instanceof ConnectionInUseError) {
      throw new ConflictException({
        code: 'CONNECTION_IN_USE',
        message: 'An active workflow version uses this connection',
      });
    }
    if (error instanceof ConnectionNameTakenError) {
      throw new ConflictException({
        code: 'CONNECTION_NAME_TAKEN',
        message: 'A connection with this name already exists',
      });
    }
    throw error;
  }
}

@Controller('api/v1/organizations/:organizationId/connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @RequirePermission('integration:read')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext): Promise<{ data: ConnectionView[] }> {
    return { data: await this.connections.list(tenant) };
  }

  @RequirePermission('integration:write')
  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createConnectionSchema)) input: CreateConnectionInput,
  ): Promise<ConnectionView> {
    return mapped(this.connections.create(tenant, input));
  }

  @RequirePermission('integration:read')
  @Get(':connectionId')
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('connectionId', new UuidParamPipe(connectionNotFound)) connectionId: string,
  ): Promise<ConnectionView> {
    return mapped(this.connections.get(tenant, connectionId));
  }

  @RequirePermission('integration:write')
  @Put(':connectionId/credential')
  replaceCredential(
    @CurrentTenant() tenant: TenantContext,
    @Param('connectionId', new UuidParamPipe(connectionNotFound)) connectionId: string,
    @Body(new ZodValidationPipe(replaceCredentialSchema)) input: ReplaceCredentialInput,
  ): Promise<ConnectionView> {
    return mapped(this.connections.replaceCredential(tenant, connectionId, input));
  }

  @RequirePermission('integration:write')
  @Delete(':connectionId')
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('connectionId', new UuidParamPipe(connectionNotFound)) connectionId: string,
  ): Promise<void> {
    await mapped(this.connections.remove(tenant, connectionId));
  }
}
