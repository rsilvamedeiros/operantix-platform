import { z } from 'zod';

/** W3C trace context trace-id: 32 lowercase hex characters, never all zeros. */
const traceId = z
  .string()
  .regex(/^[0-9a-f]{32}$/)
  .refine((value) => value !== '0'.repeat(32));

export const tenantSchema = z.object({
  organizationId: z.uuid(),
  workspaceId: z.uuid().optional(),
});

/**
 * The fields every event carries (docs/events/event-envelope.md). `data` is checked separately,
 * against the schema of the event's type and version.
 */
export const envelopeSchema = z.object({
  eventId: z.uuid(),
  eventType: z.string().min(1).max(100),
  eventVersion: z.int().min(1),
  // UTC only: an offset would make the same instant compare differently as text.
  occurredAt: z.iso.datetime(),
  producer: z.string().min(1).max(100),
  traceId,
  correlationId: z.string().min(1).max(200).optional(),
  tenant: tenantSchema,
  data: z.unknown(),
});

export type Tenant = z.infer<typeof tenantSchema>;

/** What the producer supplies; the type, version and data come from the event itself. */
export interface EventMetadata {
  eventId: string;
  occurredAt: Date;
  producer: string;
  traceId: string;
  correlationId?: string;
  tenant: Tenant;
}

export type EventContractViolation = 'INVALID_ENVELOPE' | 'UNKNOWN_EVENT' | 'INVALID_DATA';

/**
 * An event that does not satisfy its contract. The message names the offending fields but
 * never their values, which may be sensitive.
 */
export class EventContractError extends Error {
  constructor(
    readonly reason: EventContractViolation,
    readonly fields: readonly string[] = [],
  ) {
    super(fields.length > 0 ? `${reason}: ${fields.join(', ')}` : reason);
    this.name = 'EventContractError';
  }

  static fromIssues(reason: EventContractViolation, error: z.ZodError): EventContractError {
    return new EventContractError(
      reason,
      error.issues.map((issue) => issue.path.map(String).join('.') || '(root)'),
    );
  }
}
