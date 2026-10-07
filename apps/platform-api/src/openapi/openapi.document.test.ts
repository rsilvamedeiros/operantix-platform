import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTROLLERS } from '../app.module';
import { listControllerRoutes } from './controller-routes';
import { buildOpenApiDocument, type OpenApiDocument } from './openapi.document';

const COMMITTED = resolve(__dirname, '../../openapi.json');

const operationsOf = (doc: OpenApiDocument) =>
  Object.entries(doc.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, operation]) => ({
      route: `${method.toUpperCase()} ${path}`,
      operation,
    })),
  );

describe('OpenAPI document', () => {
  const doc = buildOpenApiDocument();

  it('documents exactly the routes the controllers serve', () => {
    const served = listControllerRoutes(CONTROLLERS).sort();
    const documented = operationsOf(doc)
      .map((o) => o.route)
      .sort();

    expect(documented).toEqual(served);
  });

  it('requires a bearer token everywhere except the public probes and the spec itself', () => {
    const publicRoutes = operationsOf(doc)
      .filter((o) => o.operation.security?.length === 0)
      .map((o) => o.route)
      .sort();

    expect(publicRoutes).toEqual(['GET /health/live', 'GET /health/ready', 'GET /openapi.json']);
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
  });

  it('documents the authorization failures of every tenant-scoped operation', () => {
    const tenantScoped = operationsOf(doc).filter((o) =>
      o.route.includes('/api/v1/organizations/{organizationId}'),
    );

    expect(tenantScoped.length).toBeGreaterThan(0);
    for (const { operation } of tenantScoped) {
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining(['401', '403', '404']),
      );
    }
  });

  it('matches the committed openapi.json, so contract changes show up in review', () => {
    const committed = JSON.parse(readFileSync(COMMITTED, 'utf8')) as unknown;

    // Regenerate with `pnpm --filter @operantix/platform-api openapi:generate`.
    expect(committed).toEqual(doc);
  });
});
