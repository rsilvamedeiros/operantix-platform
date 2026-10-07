import { z } from 'zod';
import type { Permission } from '../authorization/permissions';
import { createOrganizationSchema } from '../organizations/organization.dto';
import { createWorkspaceSchema } from '../organizations/workspace.dto';
import {
  activateWorkflowSchema,
  createWorkflowSchema,
  createWorkflowVersionSchema,
} from '../workflows/workflow.dto';
import * as responses from './responses';

type Method = 'get' | 'post' | 'put' | 'delete';
type Access = 'public' | 'authenticated' | Permission;

interface Response {
  description: string;
  schema: z.ZodType;
}

interface Operation {
  method: Method;
  path: string;
  summary: string;
  tag: string;
  access: Access;
  request?: z.ZodType;
  responses: Record<string, Response>;
}

const error = (description: string): Response => ({ description, schema: responses.errorResponse });
const ok = (description: string, schema: z.ZodType): Response => ({ description, schema });

const ORG = '/v1/organizations/{organizationId}';
const invalidBody = error('`VALIDATION_FAILED`: the body does not match the schema');

// Single source of the HTTP contract. A unit test checks it lists exactly the controllers'
// routes; an integration test checks real responses against these schemas.
const OPERATIONS: Operation[] = [
  {
    method: 'get',
    path: '/health/live',
    summary: 'Liveness probe',
    tag: 'health',
    access: 'public',
    responses: { '200': ok('The process is up', responses.liveResponse) },
  },
  {
    method: 'get',
    path: '/health/ready',
    summary: 'Readiness probe (PostgreSQL and Redis)',
    tag: 'health',
    access: 'public',
    responses: {
      '200': ok('All dependencies are up', responses.readinessResponse),
      '503': ok('At least one dependency is down', responses.readinessResponse),
    },
  },
  {
    method: 'get',
    path: '/openapi.json',
    summary: 'This document',
    tag: 'meta',
    access: 'public',
    responses: { '200': ok('OpenAPI 3.1 document', z.record(z.string(), z.unknown())) },
  },
  {
    method: 'get',
    path: '/v1/me',
    summary: 'The authenticated principal',
    tag: 'identity',
    access: 'authenticated',
    responses: { '200': ok('Principal from the access token', responses.principalResponse) },
  },
  {
    method: 'get',
    path: '/v1/organizations',
    summary: 'Organizations of the caller, with their role',
    tag: 'organizations',
    access: 'authenticated',
    responses: { '200': ok('Memberships of the caller', responses.myOrganizationsResponse) },
  },
  {
    method: 'post',
    path: '/v1/organizations',
    summary: 'Create an organization; the caller becomes its OWNER',
    tag: 'organizations',
    access: 'authenticated',
    request: createOrganizationSchema,
    responses: {
      '201': ok('Created', responses.organizationResponse),
      '400': invalidBody,
      '409': error('`ORGANIZATION_SLUG_TAKEN`'),
    },
  },
  {
    method: 'get',
    path: `${ORG}/workspaces`,
    summary: 'Workspaces of the organization',
    tag: 'workspaces',
    access: 'workspace:read',
    responses: { '200': ok('Workspaces', responses.workspacesResponse) },
  },
  {
    method: 'post',
    path: `${ORG}/workspaces`,
    summary: 'Create a workspace',
    tag: 'workspaces',
    access: 'workspace:create',
    request: createWorkspaceSchema,
    responses: {
      '201': ok('Created', responses.workspaceResponse),
      '400': invalidBody,
      '409': error('`WORKSPACE_SLUG_TAKEN`'),
    },
  },
  {
    method: 'get',
    path: `${ORG}/workspaces/{workspaceId}/workflows`,
    summary: 'Workflows of a workspace',
    tag: 'workflows',
    access: 'workflow:read',
    responses: { '200': ok('Workflows', responses.workflowsResponse) },
  },
  {
    method: 'post',
    path: `${ORG}/workspaces/{workspaceId}/workflows`,
    summary: 'Create a workflow with its first version',
    tag: 'workflows',
    access: 'workflow:write',
    request: createWorkflowSchema,
    responses: {
      '201': ok('Created', responses.workflowResponse),
      '400': invalidBody,
      '409': error('`WORKFLOW_KEY_TAKEN`'),
    },
  },
  {
    method: 'get',
    path: `${ORG}/workflows/{workflowId}`,
    summary: 'A workflow with its version history, newest first',
    tag: 'workflows',
    access: 'workflow:read',
    responses: { '200': ok('Workflow', responses.workflowDetailResponse) },
  },
  {
    method: 'post',
    path: `${ORG}/workflows/{workflowId}/versions`,
    summary: 'Publish a new immutable version',
    tag: 'workflows',
    access: 'workflow:write',
    request: createWorkflowVersionSchema,
    responses: {
      '201': ok('Created', responses.workflowVersionResponse),
      '400': invalidBody,
    },
  },
  {
    method: 'get',
    path: `${ORG}/workflows/{workflowId}/versions/{version}`,
    summary: 'One version with its full definition',
    tag: 'workflows',
    access: 'workflow:read',
    responses: { '200': ok('Version', responses.workflowVersionResponse) },
  },
  {
    method: 'put',
    path: `${ORG}/workflows/{workflowId}/activation`,
    summary: 'Activate a version (idempotent)',
    tag: 'workflows',
    access: 'workflow:activate',
    request: activateWorkflowSchema,
    responses: { '200': ok('Workflow', responses.workflowResponse), '400': invalidBody },
  },
  {
    method: 'delete',
    path: `${ORG}/workflows/{workflowId}/activation`,
    summary: 'Deactivate (idempotent)',
    tag: 'workflows',
    access: 'workflow:activate',
    responses: { '200': ok('Workflow', responses.workflowResponse) },
  },
];

function responsesFor(operation: Operation): Record<string, Response> {
  const all = { ...operation.responses };
  if (operation.access === 'public') return all;
  all['401'] = error('`UNAUTHENTICATED`: missing or invalid access token');
  if (operation.access !== 'authenticated') {
    all['403'] = error(`\`FORBIDDEN\`: the caller's role lacks \`${operation.access}\``);
    all['404'] = error(
      '`ORGANIZATION_NOT_FOUND` (not a member, or no such organization) or the addressed resource does not exist',
    );
  }
  return all;
}

function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): unknown {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: 'any' });
  return rest;
}

export interface OpenApiOperation {
  summary: string;
  tags: string[];
  'x-permission'?: string;
  security?: unknown[];
  parameters?: unknown[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  security: unknown[];
  components: unknown;
  paths: Record<string, Record<string, OpenApiOperation>>;
}

export function buildOpenApiDocument(): OpenApiDocument {
  const paths: OpenApiDocument['paths'] = {};
  for (const operation of OPERATIONS) {
    const parameters = [...operation.path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
      name,
      in: 'path',
      required: true,
      schema:
        name === 'version' ? { type: 'integer', minimum: 1 } : { type: 'string', format: 'uuid' },
    }));
    const entry: OpenApiOperation = {
      summary: operation.summary,
      tags: [operation.tag],
      responses: Object.fromEntries(
        Object.entries(responsesFor(operation)).map(([status, response]) => [
          status,
          {
            description: response.description,
            content: { 'application/json': { schema: jsonSchema(response.schema, 'output') } },
          },
        ]),
      ),
    };
    if (operation.access === 'public') entry.security = [];
    else if (operation.access !== 'authenticated') entry['x-permission'] = operation.access;
    if (parameters.length > 0) entry.parameters = parameters;
    if (operation.request) {
      entry.requestBody = {
        required: true,
        content: { 'application/json': { schema: jsonSchema(operation.request, 'input') } },
      };
    }
    paths[operation.path] = { ...paths[operation.path], [operation.method]: entry };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Operantix Platform API', version: '1' },
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
    paths,
  };
}

/** Schema documented for a response, or undefined when that status is not documented. */
export function documentedResponse(
  method: string,
  path: string,
  status: string,
): z.ZodType | undefined {
  const operation = OPERATIONS.find((o) => o.method === method && o.path === path);
  return operation ? responsesFor(operation)[status]?.schema : undefined;
}
