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
  type CreateInboundWebhookInput,
  createInboundWebhookSchema,
  type InboundWebhookView,
  type InboundWebhookWithSecretView,
} from './inbound-webhook.dto';
import {
  InboundWebhookNotFoundError,
  InboundWebhooksService,
  InboundWorkflowNotFoundError,
} from './inbound-webhooks.service';

export const inboundWebhookNotFound = () =>
  new NotFoundException({
    code: 'INBOUND_WEBHOOK_NOT_FOUND',
    message: 'Inbound webhook not found',
  });

/** Maps inbound webhook domain errors to HTTP; anything else propagates as a 500. */
async function mapped<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof InboundWebhookNotFoundError) throw inboundWebhookNotFound();
    if (error instanceof InboundWorkflowNotFoundError) {
      throw new NotFoundException({ code: 'WORKFLOW_NOT_FOUND', message: 'Workflow not found' });
    }
    throw error;
  }
}

@Controller('api/v1/organizations/:organizationId/inbound-webhooks')
export class InboundWebhooksController {
  constructor(private readonly hooks: InboundWebhooksService) {}

  @RequirePermission('integration:read')
  @Get()
  async list(@CurrentTenant() tenant: TenantContext): Promise<{ data: InboundWebhookView[] }> {
    return { data: await this.hooks.list(tenant) };
  }

  @RequirePermission('integration:write')
  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createInboundWebhookSchema)) input: CreateInboundWebhookInput,
  ): Promise<InboundWebhookWithSecretView> {
    return mapped(this.hooks.create(tenant, input));
  }

  @RequirePermission('integration:read')
  @Get(':inboundWebhookId')
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('inboundWebhookId', new UuidParamPipe(inboundWebhookNotFound)) hookId: string,
  ): Promise<InboundWebhookView> {
    return mapped(this.hooks.get(tenant, hookId));
  }

  @RequirePermission('integration:write')
  @Post(':inboundWebhookId/rotate-secret')
  @HttpCode(200)
  rotateSecret(
    @CurrentTenant() tenant: TenantContext,
    @Param('inboundWebhookId', new UuidParamPipe(inboundWebhookNotFound)) hookId: string,
  ): Promise<InboundWebhookWithSecretView> {
    return mapped(this.hooks.rotateSecret(tenant, hookId));
  }

  @RequirePermission('integration:write')
  @Delete(':inboundWebhookId')
  @HttpCode(204)
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('inboundWebhookId', new UuidParamPipe(inboundWebhookNotFound)) hookId: string,
  ): Promise<void> {
    await mapped(this.hooks.remove(tenant, hookId));
  }
}
