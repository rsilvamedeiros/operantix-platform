import type { z } from 'zod';
import { type EventMetadata, EventContractError, envelopeSchema, type Tenant } from './envelope';
import { EXECUTION_EVENT_DEFINITIONS } from './execution-events';

/** Every known event version, keyed `type@version`. Older versions stay until no producer emits them. */
export const EVENT_DEFINITIONS = { ...EXECUTION_EVENT_DEFINITIONS } as const;

type DefinitionKey = keyof typeof EVENT_DEFINITIONS;

/** The version producers emit today for each event type. */
const CURRENT_VERSION = {
  'execution.started': 1,
  'execution.step.started': 1,
  'execution.step.completed': 1,
  'execution.step.failed': 1,
  'execution.completed': 1,
  'execution.failed': 1,
} as const satisfies Record<string, number>;

export type EventType = keyof typeof CURRENT_VERSION;

type CurrentKey<T extends EventType> = `${T}@${(typeof CURRENT_VERSION)[T]}` & DefinitionKey;

export type EventData<T extends EventType> = z.output<(typeof EVENT_DEFINITIONS)[CurrentKey<T>]>;

export interface EventEnvelope<T extends EventType = EventType> {
  eventId: string;
  eventType: T;
  eventVersion: number;
  /** UTC ISO-8601. */
  occurredAt: string;
  producer: string;
  traceId: string;
  correlationId?: string;
  tenant: Tenant;
  data: EventData<T>;
}

/** Any event at its current version, discriminated by `eventType`. */
export type AnyEvent = { [T in EventType]: EventEnvelope<T> }[EventType];

const isDefinitionKey = (key: string): key is DefinitionKey =>
  Object.hasOwn(EVENT_DEFINITIONS, key);

/** Builds an event at its current version, validating both the envelope and the data. */
export function createEvent<T extends EventType>(
  eventType: T,
  data: EventData<T>,
  meta: EventMetadata,
): EventEnvelope<T> {
  const parsed = parseEvent({
    ...meta,
    occurredAt: meta.occurredAt.toISOString(),
    eventType,
    eventVersion: CURRENT_VERSION[eventType],
    data,
  });
  return parsed as EventEnvelope<T>;
}

/**
 * Validates untrusted input (a consumed message) against the envelope and its event's schema.
 * Unknown fields are dropped, so a consumer keeps working when a producer adds optional ones.
 */
export function parseEvent(raw: unknown): AnyEvent {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) throw EventContractError.fromIssues('INVALID_ENVELOPE', envelope.error);

  const key = `${envelope.data.eventType}@${String(envelope.data.eventVersion)}`;
  if (!isDefinitionKey(key)) throw new EventContractError('UNKNOWN_EVENT', ['eventType']);

  const data = EVENT_DEFINITIONS[key].safeParse(envelope.data.data);
  if (!data.success) throw EventContractError.fromIssues('INVALID_DATA', data.error);

  return { ...envelope.data, data: data.data } as AnyEvent;
}

/** Kafka partition key: one execution's events share a partition and so keep their order. */
export function partitionKey(event: AnyEvent): string {
  return event.data.executionId;
}
