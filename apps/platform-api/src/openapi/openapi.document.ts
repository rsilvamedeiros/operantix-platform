import { z } from 'zod';
import type { Permission } from '../authorization/permissions';
import { createOrganizationSchema } from '../organizations/organization.dto';
import { createWorkspaceSchema } from '../organizations/workspace.dto';
import {
  activateWorkflowSchema,
  createWorkflowSchema,
  createWorkflowVersionSchema,
} from '../workflows/workflow.dto';
import { startExecutionSchema } from '../executions/execution.dto';
import { createConnectionSchema, replaceCredentialSchema } from '../integrations/connection.dto';
import { createInboundWebhookSchema } from '../integrations/inbound-webhook.dto';
import {
  createWebhookEndpointSchema,
  setWebhookEndpointStatusSchema,
} from '../integrations/webhook-endpoint.dto';
import * as responses from './responses';

type Method = 'get' | 'post' | 'put' | 'delete';
type Access = 'public' | 'authenticated' | Permission;

interface Response {
  description: string;
  /** Absent for responses without a body (204). */
  schema?: z.ZodType;
}

interface Parameter {
  name: string;
  in: 'query' | 'header';
  description: string;
  schema: Record<string, unknown>;
  required?: boolean;
}

interface Operation {
  method: Method;
  path: string;
  summary: string;
  tag: string;
  access: Access;
  request?: z.ZodType;
  /** Query and header parameters; path parameters are derived from the path. */
  parameters?: Parameter[];
  responses: Record<string, Response>;
}

const error = (description: string): Response => ({ description, schema: responses.errorResponse });
const ok = (description: string, schema: z.ZodType): Response => ({ description, schema });
const noContent = (description: string): Response => ({ description });

const ORG = '/api/v1/organizations/{organizationId}';
const invalidBody = error('`VALIDATION_FAILED`: the body does not match the schema');
const pageParameters: Parameter[] = [
  {
    name: 'limit',
    in: 'query',
    description: 'Page size',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
  {
    name: 'cursor',
    in: 'query',
    description: '`nextCursor` of the previous page',
    schema: { type: 'string' },
  },
];

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
    path: '/api/v1/me',
    summary: 'The authenticated principal',
    tag: 'identity',
    access: 'authenticated',
    responses: { '200': ok('Principal from the access token', responses.principalResponse) },
  },
  {
    method: 'get',
    path: '/api/v1/organizations',
    summary: 'Organizations of the caller, with their role',
    tag: 'organizations',
    access: 'authenticated',
    responses: { '200': ok('Memberships of the caller', responses.myOrganizationsResponse) },
  },
  {
    method: 'post',
    path: '/api/v1/organizations',
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
  {
    method: 'post',
    path: `${ORG}/workflows/{workflowId}/executions`,
    summary: 'Start an execution of the active version',
    tag: 'executions',
    access: 'execution:start',
    request: startExecutionSchema,
    parameters: [
      {
        name: 'Idempotency-Key',
        in: 'header',
        description:
          'Retries with the same key and body return the first execution (200) instead of starting another',
        schema: { type: 'string', minLength: 1, maxLength: 200, pattern: '^[\\x21-\\x7e]+$' },
      },
    ],
    responses: {
      '201': ok('Started', responses.executionDetailResponse),
      '200': ok(
        'Replay of an earlier request with the same key',
        responses.executionDetailResponse,
      ),
      '400': invalidBody,
      '409': error(
        '`WORKFLOW_INACTIVE` (no active version) or `IDEMPOTENCY_KEY_REUSED` (same key, different body)',
      ),
    },
  },
  {
    method: 'get',
    path: `${ORG}/workflows/{workflowId}/executions`,
    summary: 'Executions of a workflow, newest first',
    tag: 'executions',
    access: 'execution:read',
    parameters: pageParameters,
    responses: {
      '200': ok('A page of executions', responses.executionPageResponse),
      '400': error('`VALIDATION_FAILED`: invalid `limit` or `cursor`'),
    },
  },
  {
    method: 'get',
    path: `${ORG}/executions/{executionId}`,
    summary: 'An execution with its steps in definition order',
    tag: 'executions',
    access: 'execution:read',
    responses: { '200': ok('Execution', responses.executionDetailResponse) },
  },
  {
    method: 'get',
    path: `${ORG}/executions/{executionId}/timeline`,
    summary: 'What happened to an execution, oldest first (`execution.*` and `step.*` events)',
    tag: 'executions',
    access: 'execution:read',
    responses: { '200': ok('Timeline', responses.executionTimelineResponse) },
  },
  {
    method: 'post',
    path: `${ORG}/webhook-endpoints`,
    summary: 'Register a webhook endpoint for execution events; returns its signing secret once',
    tag: 'webhooks',
    access: 'integration:write',
    request: createWebhookEndpointSchema,
    responses: {
      '201': ok('Created, with the signing secret', responses.webhookEndpointWithSecretResponse),
      '400': invalidBody,
    },
  },
  {
    method: 'get',
    path: `${ORG}/webhook-endpoints`,
    summary: 'Webhook endpoints of the organization, oldest first',
    tag: 'webhooks',
    access: 'integration:read',
    responses: { '200': ok('Webhook endpoints', responses.webhookEndpointsResponse) },
  },
  {
    method: 'get',
    path: `${ORG}/webhook-endpoints/{endpointId}`,
    summary: 'A webhook endpoint (never its secret)',
    tag: 'webhooks',
    access: 'integration:read',
    responses: { '200': ok('Webhook endpoint', responses.webhookEndpointResponse) },
  },
  {
    method: 'post',
    path: `${ORG}/webhook-endpoints/{endpointId}/rotate-secret`,
    summary: 'Replace the signing secret at once; returns the new one',
    tag: 'webhooks',
    access: 'integration:write',
    responses: {
      '200': ok(
        'Rotated, with the new signing secret',
        responses.webhookEndpointWithSecretResponse,
      ),
    },
  },
  {
    method: 'put',
    path: `${ORG}/webhook-endpoints/{endpointId}/status`,
    summary: 'Enable or disable an endpoint; enabling clears its failure count',
    tag: 'webhooks',
    access: 'integration:write',
    request: setWebhookEndpointStatusSchema,
    responses: {
      '200': ok('Webhook endpoint', responses.webhookEndpointResponse),
      '400': invalidBody,
    },
  },
  {
    method: 'get',
    path: `${ORG}/webhook-endpoints/{endpointId}/deliveries`,
    summary: 'Deliveries to an endpoint, newest first (without payloads)',
    tag: 'webhooks',
    access: 'integration:read',
    parameters: pageParameters,
    responses: {
      '200': ok('A page of deliveries', responses.webhookDeliveryPageResponse),
      '400': error('`VALIDATION_FAILED`: invalid `limit` or `cursor`'),
    },
  },
  {
    method: 'get',
    path: `${ORG}/webhook-endpoints/{endpointId}/deliveries/{deliveryId}`,
    summary: 'A delivery with its attempts, oldest first',
    tag: 'webhooks',
    access: 'integration:read',
    responses: { '200': ok('Delivery', responses.webhookDeliveryDetailResponse) },
  },
  {
    method: 'post',
    path: `${ORG}/webhook-endpoints/{endpointId}/deliveries/{deliveryId}/retry`,
    summary: 'Queue a failed delivery again, with a fresh attempt budget',
    tag: 'webhooks',
    access: 'integration:write',
    responses: {
      '200': ok('Queued again', responses.webhookDeliveryDetailResponse),
      '409': error(
        '`WEBHOOK_DELIVERY_NOT_FAILED` (still pending or succeeded) or `WEBHOOK_ENDPOINT_DISABLED`',
      ),
    },
  },
  {
    method: 'delete',
    path: `${ORG}/webhook-endpoints/{endpointId}`,
    summary: 'Delete a webhook endpoint and its secret',
    tag: 'webhooks',
    access: 'integration:write',
    responses: { '204': noContent('Deleted') },
  },
  {
    method: 'post',
    path: `${ORG}/inbound-webhooks`,
    summary: 'Create a signed URL that starts a workflow; returns its signing secret once',
    tag: 'webhooks',
    access: 'integration:write',
    request: createInboundWebhookSchema,
    responses: {
      '201': ok('Created, with the signing secret', responses.inboundWebhookWithSecretResponse),
      '400': invalidBody,
    },
  },
  {
    method: 'get',
    path: `${ORG}/inbound-webhooks`,
    summary: 'Inbound webhooks of the organization, oldest first',
    tag: 'webhooks',
    access: 'integration:read',
    responses: { '200': ok('Inbound webhooks', responses.inboundWebhooksResponse) },
  },
  {
    method: 'get',
    path: `${ORG}/inbound-webhooks/{inboundWebhookId}`,
    summary: 'An inbound webhook (never its secret)',
    tag: 'webhooks',
    access: 'integration:read',
    responses: { '200': ok('Inbound webhook', responses.inboundWebhookResponse) },
  },
  {
    method: 'post',
    path: `${ORG}/inbound-webhooks/{inboundWebhookId}/rotate-secret`,
    summary: 'Replace the signing secret at once; returns the new one',
    tag: 'webhooks',
    access: 'integration:write',
    responses: {
      '200': ok('Rotated, with the new signing secret', responses.inboundWebhookWithSecretResponse),
    },
  },
  {
    method: 'delete',
    path: `${ORG}/inbound-webhooks/{inboundWebhookId}`,
    summary: 'Delete an inbound webhook and its secret',
    tag: 'webhooks',
    access: 'integration:write',
    responses: { '204': noContent('Deleted') },
  },
  {
    method: 'post',
    path: `${ORG}/connections`,
    summary: 'Store a credential for HTTP steps, bound to a base URL (never returned)',
    tag: 'connections',
    access: 'integration:write',
    request: createConnectionSchema,
    responses: {
      '201': ok('Created', responses.connectionResponse),
      '400': invalidBody,
      '409': error('`CONNECTION_NAME_TAKEN`'),
    },
  },
  {
    method: 'get',
    path: `${ORG}/connections`,
    summary: 'Connections of the organization, by name',
    tag: 'connections',
    access: 'integration:read',
    responses: { '200': ok('Connections', responses.connectionsResponse) },
  },
  {
    method: 'get',
    path: `${ORG}/connections/{connectionId}`,
    summary: 'A connection (never its credential)',
    tag: 'connections',
    access: 'integration:read',
    responses: { '200': ok('Connection', responses.connectionResponse) },
  },
  {
    method: 'put',
    path: `${ORG}/connections/{connectionId}/credential`,
    summary: 'Replace the credential at once',
    tag: 'connections',
    access: 'integration:write',
    request: replaceCredentialSchema,
    responses: {
      '200': ok('Connection', responses.connectionResponse),
      '400': invalidBody,
    },
  },
  {
    method: 'delete',
    path: `${ORG}/connections/{connectionId}`,
    summary: 'Delete a connection and its credential',
    tag: 'connections',
    access: 'integration:write',
    responses: { '204': noContent('Deleted') },
  },
  {
    method: 'post',
    path: '/hooks/v1/{organizationId}/{inboundWebhookId}',
    summary:
      "Start the webhook's workflow with a signed JSON object as input (no access token; ADR-0024)",
    tag: 'webhooks',
    access: 'public',
    request: z.record(z.string(), z.unknown()),
    parameters: [
      {
        name: 'Operantix-Signature',
        in: 'header',
        required: true,
        description:
          '`t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`, within 5 minutes',
        schema: { type: 'string' },
      },
      {
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        description: 'A repeated key with the same body returns the same execution',
        schema: { type: 'string', minLength: 1, maxLength: 200 },
      },
    ],
    responses: {
      '202': ok('Execution started', responses.inboundDeliveryAcceptedResponse),
      '200': ok('Replay of an earlier delivery', responses.inboundDeliveryAcceptedResponse),
      '400': error(
        '`VALIDATION_FAILED`: missing `Idempotency-Key` or a body that is not an object',
      ),
      '401': error('`WEBHOOK_SIGNATURE_INVALID`: missing, invalid or expired signature'),
      '404': error('`INBOUND_WEBHOOK_NOT_FOUND`'),
      '409': error('`WORKFLOW_INACTIVE` or `IDEMPOTENCY_KEY_REUSED`'),
      '415': error('`UNSUPPORTED_MEDIA_TYPE`: the body is not `application/json`'),
    },
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
    const parameters: unknown[] = [
      ...[...operation.path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
        name,
        in: 'path',
        required: true,
        schema:
          name === 'version' ? { type: 'integer', minimum: 1 } : { type: 'string', format: 'uuid' },
      })),
      ...(operation.parameters ?? []).map((parameter) => ({
        ...parameter,
        required: parameter.required ?? false,
      })),
    ];
    const entry: OpenApiOperation = {
      summary: operation.summary,
      tags: [operation.tag],
      responses: Object.fromEntries(
        Object.entries(responsesFor(operation)).map(([status, response]) => [
          status,
          response.schema
            ? {
                description: response.description,
                content: { 'application/json': { schema: jsonSchema(response.schema, 'output') } },
              }
            : { description: response.description },
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
  const response = operation ? responsesFor(operation)[status] : undefined;
  if (!response) return undefined;
  // A documented response without a body: supertest parses it as `{}`.
  return response.schema ?? z.object({}).strict();
}
