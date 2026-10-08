import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { UuidParamPipe } from '../shared/path-params';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import type { TenantContext } from '../tenancy/tenant-context';
import {
  type CreateWebhookEndpointInput,
  createWebhookEndpointSchema,
  type WebhookEndpointView,
  type WebhookEndpointWithSecretView,
} from './webhook-endpoint.dto';
import { WebhookEndpointNotFoundError, WebhookEndpointsService } from './webhook-endpoints.service';

const endpointNotFound = () =>
  new NotFoundException({
    code: 'WEBHOOK_ENDPOINT_NOT_FOUND',
    message: 'Webhook endpoint not found',
  });

/** Maps webhook domain errors to HTTP; anything else propagates as a 500. */
async function mapped<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof WebhookEndpointNotFoundError) throw endpointNotFound();
    throw error;
  }
}

@Controller('api/v1/organizations/:organizationId/webhook-endpoints')
export class WebhookEndpointsController {
  constructor(private readonly endpoints: WebhookEndpointsService) {}

  @RequirePermission('integration:read')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext): Promise<{ data: WebhookEndpointView[] }> {
    return { data: await this.endpoints.list(tenant) };
  }

  @RequirePermission('integration:write')
  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createWebhookEndpointSchema)) input: CreateWebhookEndpointInput,
  ): Promise<WebhookEndpointWithSecretView> {
    return this.endpoints.create(tenant, input);
  }

  @RequirePermission('integration:read')
  @Get(':endpointId')
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('endpointId', new UuidParamPipe(endpointNotFound)) endpointId: string,
  ): Promise<WebhookEndpointView> {
    return mapped(this.endpoints.get(tenant, endpointId));
  }

  @RequirePermission('integration:write')
  @Post(':endpointId/rotate-secret')
  @HttpCode(200)
  rotateSecret(
    @CurrentTenant() tenant: TenantContext,
    @Param('endpointId', new UuidParamPipe(endpointNotFound)) endpointId: string,
  ): Promise<WebhookEndpointWithSecretView> {
    return mapped(this.endpoints.rotateSecret(tenant, endpointId));
  }

  @RequirePermission('integration:write')
  @Delete(':endpointId')
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('endpointId', new UuidParamPipe(endpointNotFound)) endpointId: string,
  ): Promise<void> {
    await mapped(this.endpoints.remove(tenant, endpointId));
  }
}
