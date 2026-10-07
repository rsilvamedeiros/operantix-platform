import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { buildOpenApiDocument, type OpenApiDocument } from './openapi.document';

const DOCUMENT = buildOpenApiDocument();

@Public()
@Controller()
export class OpenApiController {
  @Get('openapi.json')
  document(): OpenApiDocument {
    return DOCUMENT;
  }
}
