import {
  ConflictException,
  Controller,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { IdempotencyKeyReusedError, WorkflowInactiveError } from '../executions/executions.service';
import { UuidParamPipe } from '../shared/path-params';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import {
  type InboundDeliveryAccepted,
  inboundIdempotencyKeySchema,
  inboundPayloadSchema,
} from './inbound-webhook.dto';
import { inboundWebhookNotFound } from './inbound-webhooks.controller';
import {
  InboundWebhookNotFoundError,
  InboundWebhooksService,
  WebhookSignatureInvalidError,
} from './inbound-webhooks.service';

/** The slice of the platform request a delivery needs; `rawBody` is kept by `createApp`. */
interface DeliveryRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody?: Buffer;
}

interface StatusResponse {
  status(code: number): unknown;
}

const JSON_MEDIA_TYPE = /^application\/(?:[\w.+-]+\+)?json\s*(?:;|$)/i;

const header = (request: DeliveryRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

const keyPipe = new ZodValidationPipe(inboundIdempotencyKeySchema, 'Headers are invalid');
const payloadPipe = new ZodValidationPipe(
  inboundPayloadSchema,
  'Request body must be a JSON object',
);

/** Maps delivery errors to HTTP; anything else propagates as a 500. */
function toHttp(error: unknown): unknown {
  if (error instanceof InboundWebhookNotFoundError) return inboundWebhookNotFound();
  if (error instanceof WebhookSignatureInvalidError) {
    return new UnauthorizedException({
      code: 'WEBHOOK_SIGNATURE_INVALID',
      message: 'Webhook signature is missing, invalid or expired',
    });
  }
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
  return error;
}

/**
 * Public entry for signed deliveries (ADR-0024). No access token: the HMAC signature over the
 * raw body is the credential, checked before anything else about the request is looked at.
 */
@Public()
@Controller('hooks/v1')
export class InboundWebhookReceiverController {
  constructor(private readonly hooks: InboundWebhooksService) {}

  @Post(':organizationId/:inboundWebhookId')
  async receive(
    @Param('organizationId', new UuidParamPipe(inboundWebhookNotFound)) organizationId: string,
    @Param('inboundWebhookId', new UuidParamPipe(inboundWebhookNotFound)) hookId: string,
    @Req() request: DeliveryRequest,
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<InboundDeliveryAccepted> {
    if (!JSON_MEDIA_TYPE.test(header(request, 'content-type') ?? '')) {
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Deliveries must be application/json',
      });
    }
    try {
      const delivery = await this.hooks.authenticate(
        organizationId,
        hookId,
        header(request, 'operantix-signature'),
        request.rawBody ?? Buffer.alloc(0),
        new Date(),
      );
      const idempotencyKey = keyPipe.transform(header(request, 'idempotency-key'));
      const payload = payloadPipe.transform(request.body);
      const result = await this.hooks.start(delivery, payload, idempotencyKey);
      response.status(result.created ? HttpStatus.ACCEPTED : HttpStatus.OK);
      return { executionId: result.execution.id };
    } catch (error) {
      throw toHttp(error);
    }
  }
}
