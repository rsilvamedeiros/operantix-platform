import { z } from 'zod';

// Workflow definition contract, schemaVersion 1. Steps run in order (linear); branching and
// more step types arrive with the execution engine (M03). A version stores the definition as
// validated here and never changes afterwards.

const CRON_FIELD = /^[\d*/,-]+$/;
const cron = z.string().refine((value) => {
  const fields = value.trim().split(/\s+/);
  return fields.length === 5 && fields.every((field) => CRON_FIELD.test(field));
}, 'Expected a five-field cron expression');

const trigger = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('manual') }),
  z.strictObject({ type: z.literal('schedule'), cron }),
]);

// Definitions are stored in plain text and readable by every role, so credentials must not be
// inlined. Secret references for HTTP steps arrive with integrations (M05).
const CREDENTIAL_HEADER = /^(authorization|proxy-authorization|cookie|x-api-key|x-auth-token)$/i;
const headers = z
  .record(z.string(), z.string())
  .refine(
    (value) => Object.keys(value).every((name) => !CREDENTIAL_HEADER.test(name)),
    'Credential headers are not allowed; use a secret reference',
  );

const stepBase = {
  id: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/, 'Expected a lowercase identifier'),
  name: z.string().trim().min(1).max(100),
};

const step = z.discriminatedUnion('type', [
  z.strictObject({
    ...stepBase,
    type: z.literal('http_request'),
    config: z.strictObject({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      // Only the scheme is checked here; destination policy (SSRF) is enforced at execution.
      url: z.url({ protocol: /^https?$/ }),
      headers: headers.optional(),
      body: z.unknown().optional(),
    }),
  }),
  z.strictObject({
    ...stepBase,
    type: z.literal('delay'),
    config: z.strictObject({ seconds: z.int().min(1).max(86_400) }),
  }),
  z.strictObject({
    ...stepBase,
    type: z.literal('log'),
    config: z.strictObject({ message: z.string().min(1).max(1_000) }),
  }),
]);

export const MAX_STEPS = 50;

export const workflowDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  trigger,
  steps: z
    .array(step)
    .min(1)
    .max(MAX_STEPS)
    .superRefine((steps, ctx) => {
      const seen = new Set<string>();
      steps.forEach((s, index) => {
        if (seen.has(s.id)) {
          ctx.addIssue({ code: 'custom', message: 'Duplicate step id', path: [index, 'id'] });
        }
        seen.add(s.id);
      });
    }),
});

export type WorkflowDefinition = z.output<typeof workflowDefinitionSchema>;
