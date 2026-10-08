import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { InvalidCursorError } from '../shared/keyset-cursor';
import { UuidParamPipe } from '../shared/path-params';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { CurrentTenant } from '../tenancy/current-tenant.decorator';
import type { TenantContext } from '../tenancy/tenant-context';
import {
  WebhookDeliveriesService,
  WebhookDeliveryNotFailedError,
  WebhookDeliveryNotFoundError,
  WebhookEndpointDisabledError,
} from './webhook-deliveries.service';
import {
  type ListWebhookDeliveriesQuery,
  listWebhookDeliveriesQuerySchema,
  type WebhookDeliveryDetailView,
  type WebhookDeliveryPage,
} from './webhook-delivery.dto';
import { endpointNotFound } from './webhook-endpoints.controller';
import { WebhookEndpointNotFoundError } from './webhook-endpoints.service';

const deliveryNotFound = () =>
  new NotFoundException({
    code: 'WEBHOOK_DELIVERY_NOT_FOUND',
    message: 'Webhook delivery not found',
  });

/** Maps delivery domain errors to HTTP; anything else propagates as a 500. */
function toHttp(error: unknown): unknown {
  if (error instanceof WebhookEndpointNotFoundError) return endpointNotFound();
  if (error instanceof WebhookDeliveryNotFoundError) return deliveryNotFound();
  if (error instanceof WebhookDeliveryNotFailedError) {
    return new ConflictException({
      code: 'WEBHOOK_DELIVERY_NOT_FAILED',
      message: 'Only failed deliveries can be retried',
    });
  }
  if (error instanceof WebhookEndpointDisabledError) {
    return new ConflictException({
      code: 'WEBHOOK_ENDPOINT_DISABLED',
      message: 'Enable the endpoint before retrying its deliveries',
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

@Controller('api/v1/organizations/:organizationId/webhook-endpoints/:endpointId/deliveries')
export class WebhookDeliveriesController {
  constructor(private readonly deliveries: WebhookDeliveriesService) {}

  @RequirePermission('integration:read')
  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Param('endpointId', new UuidParamPipe(endpointNotFound)) endpointId: string,
    @Query(new ZodValidationPipe(listWebhookDeliveriesQuerySchema, 'Query parameters are invalid'))
    query: ListWebhookDeliveriesQuery,
  ): Promise<WebhookDeliveryPage> {
    return mapped(this.deliveries.list(tenant, endpointId, query));
  }

  @RequirePermission('integration:read')
  @Get(':deliveryId')
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('endpointId', new UuidParamPipe(endpointNotFound)) endpointId: string,
    @Param('deliveryId', new UuidParamPipe(deliveryNotFound)) deliveryId: string,
  ): Promise<WebhookDeliveryDetailView> {
    return mapped(this.deliveries.get(tenant, endpointId, deliveryId));
  }

  @RequirePermission('integration:write')
  @Post(':deliveryId/retry')
  @HttpCode(200)
  retry(
    @CurrentTenant() tenant: TenantContext,
    @Param('endpointId', new UuidParamPipe(endpointNotFound)) endpointId: string,
    @Param('deliveryId', new UuidParamPipe(deliveryNotFound)) deliveryId: string,
  ): Promise<WebhookDeliveryDetailView> {
    return mapped(this.deliveries.retry(tenant, endpointId, deliveryId));
  }
}
