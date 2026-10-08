import { z } from 'zod';
import { roles } from '../identity/identity.schema';
import { workflowDefinitionSchema } from '../workflows/workflow-definition';

// Wire format of responses (dates as ISO strings). The API contract test parses real
// responses with these schemas, so they cannot drift from what controllers return.

const timestamp = z.iso.datetime();

export const errorResponse = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const liveResponse = z.object({ status: z.literal('ok') });

export const readinessResponse = z.object({
  status: z.enum(['ok', 'error']),
  checks: z.record(z.string(), z.enum(['up', 'down'])),
});

export const principalResponse = z.object({
  subject: z.string(),
  email: z.string().optional(),
  name: z.string().optional(),
});

export const organizationResponse = z.object({ id: z.uuid(), name: z.string(), slug: z.string() });

export const myOrganizationsResponse = z.object({
  data: z.array(organizationResponse.extend({ role: z.enum(roles) })),
});

export const workspaceResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: timestamp,
});

export const workspacesResponse = z.object({ data: z.array(workspaceResponse) });

export const workflowResponse = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string(),
  key: z.string(),
  latestVersion: z.int().min(1),
  activeVersion: z.int().min(1).nullable(),
  createdAt: timestamp,
});

export const workflowsResponse = z.object({ data: z.array(workflowResponse) });

const versionSummary = z.object({
  version: z.int().min(1),
  createdBy: z.uuid(),
  createdAt: timestamp,
});

export const workflowDetailResponse = workflowResponse.extend({
  versions: z.array(versionSummary),
});

export const workflowVersionResponse = versionSummary.extend({
  workflowId: z.uuid(),
  definition: workflowDefinitionSchema,
});

const executionStatus = z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']);

export const executionResponse = z.object({
  id: z.uuid(),
  workflowId: z.uuid(),
  workflowVersion: z.int().min(1),
  status: executionStatus,
  triggerType: z.string(),
  triggeredBy: z.uuid().nullable(),
  input: z.record(z.string(), z.unknown()),
  error: z.record(z.string(), z.unknown()).nullable(),
  createdAt: timestamp,
  startedAt: timestamp.nullable(),
  finishedAt: timestamp.nullable(),
});

const stepExecutionResponse = z.object({
  stepId: z.string(),
  position: z.int().min(0),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'WAITING']),
  attempts: z.int().min(0),
  output: z.unknown(),
  error: z.record(z.string(), z.unknown()).nullable(),
  startedAt: timestamp.nullable(),
  finishedAt: timestamp.nullable(),
});

export const executionDetailResponse = executionResponse.extend({
  steps: z.array(stepExecutionResponse),
});

export const executionPageResponse = z.object({
  data: z.array(executionResponse),
  nextCursor: z.string().nullable(),
});

export const executionTimelineResponse = z.object({
  data: z.array(
    z.object({
      type: z.string(),
      stepId: z.string().nullable(),
      attempt: z.int().min(1).nullable(),
      details: z.record(z.string(), z.unknown()).nullable(),
      occurredAt: timestamp,
    }),
  ),
});

export const webhookEndpointResponse = z.object({
  id: z.uuid(),
  url: z.url(),
  description: z.string().nullable(),
  eventTypes: z.array(z.string()),
  status: z.enum(['ACTIVE', 'DISABLED']),
  consecutiveFailures: z.int().min(0),
  createdAt: timestamp,
});

export const webhookEndpointsResponse = z.object({ data: z.array(webhookEndpointResponse) });

export const webhookEndpointWithSecretResponse = webhookEndpointResponse.extend({
  signingSecret: z
    .string()
    .regex(/^whsec_[A-Za-z0-9_-]{43}$/)
    .describe('Shown only now; store it to verify `Operantix-Signature` headers'),
});

const webhookDeliveryResponse = z.object({
  id: z.uuid(),
  endpointId: z.uuid(),
  eventId: z.uuid(),
  eventType: z.string(),
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED']),
  attempts: z.int().min(0),
  nextAttemptAt: timestamp,
  lastStatusCode: z.int().nullable(),
  lastErrorCode: z.string().nullable(),
  createdAt: timestamp,
  completedAt: timestamp.nullable(),
});

export const webhookDeliveryPageResponse = z.object({
  data: z.array(webhookDeliveryResponse),
  nextCursor: z.string().nullable(),
});

export const webhookDeliveryDetailResponse = webhookDeliveryResponse.extend({
  attemptHistory: z.array(
    z.object({
      attempt: z.int().min(1),
      statusCode: z.int().nullable(),
      errorCode: z.string().nullable(),
      durationMs: z.int().min(0),
      attemptedAt: timestamp,
    }),
  ),
});
