import type { z } from 'zod';

export interface OpenApiOperation {
  security?: unknown[];
  responses: Record<string, unknown>;
}
export interface OpenApiDocument {
  security: unknown[];
  paths: Record<string, Record<string, OpenApiOperation>>;
}

export function buildOpenApiDocument(): OpenApiDocument {
  return { security: [], paths: {} };
}

export function documentedResponse(
  _method: string,
  _path: string,
  _status: string,
): z.ZodType | undefined {
  return undefined;
}
