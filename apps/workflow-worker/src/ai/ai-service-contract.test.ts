import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classificationSchema, classifyTextRequestSchema } from './ai-service-client';

// The AI service commits its OpenAPI document (ADR-0028); this keeps the client in step with it.
const document = JSON.parse(
  readFileSync(new URL('../../../../services/ai-service/openapi.json', import.meta.url), 'utf8'),
) as {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, { properties: object; required?: string[] }> };
};
const schema = (name: string) => document.components.schemas[name];
const keys = (shape: object) => Object.keys(shape).sort();

describe('AI service contract', () => {
  it('serves POST /v1/classifications', () => {
    expect(document.paths['/v1/classifications']).toHaveProperty('post');
  });

  it('sends exactly the request fields the service accepts', () => {
    const request = schema('ClassifyTextRequest');

    expect(keys(classifyTextRequestSchema.shape)).toEqual(keys(request?.properties ?? {}));
    expect(keys(classifyTextRequestSchema.shape.labels.element.shape)).toEqual(
      keys(schema('Label')?.properties ?? {}),
    );
    expect(keys(classifyTextRequestSchema.shape.tenant.shape)).toEqual(
      keys(schema('Tenant')?.properties ?? {}),
    );
  });

  it('reads the response fields the service always returns', () => {
    expect(keys(classificationSchema.shape)).toEqual(
      [...(schema('ClassifyTextResponse')?.required ?? [])].sort(),
    );
    expect(keys(classificationSchema.shape.usage.shape)).toEqual(
      [...(schema('UsageView')?.required ?? [])].sort(),
    );
  });
});
