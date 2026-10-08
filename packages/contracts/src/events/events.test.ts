import { describe, expect, it } from 'vitest';
import {
  createEvent,
  EVENT_DEFINITIONS,
  EventContractError,
  type EventMetadata,
  parseEvent,
  partitionKey,
  topicFor,
} from '../index';

const ORG = '0b9f6c1e-3d4a-4f7b-9a51-2c8e7d6f5a43';
const EXECUTION = '6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c';
const WORKFLOW = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const meta: EventMetadata = {
  eventId: 'c3d2e1f0-a9b8-4c7d-8e6f-5a4b3c2d1e0f',
  occurredAt: new Date('2026-10-08T12:00:00.000Z'),
  producer: 'workflow-worker',
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  tenant: { organizationId: ORG },
};

const started = () =>
  createEvent(
    'execution.started',
    { executionId: EXECUTION, workflowId: WORKFLOW, workflowVersion: 2 },
    meta,
  );

/** The envelope as it travels: JSON, with dates as strings. */
const wire = (event: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(event)) as Record<string, unknown>;

const reason = (raw: unknown): string | undefined => {
  try {
    parseEvent(raw);
  } catch (error) {
    if (error instanceof EventContractError) return error.reason;
    throw error;
  }
  return undefined;
};

describe('event envelope', () => {
  it('wraps the data in the standard envelope at the current version', () => {
    expect(wire(started())).toEqual({
      eventId: meta.eventId,
      eventType: 'execution.started',
      eventVersion: 1,
      occurredAt: '2026-10-08T12:00:00.000Z',
      producer: 'workflow-worker',
      traceId: meta.traceId,
      tenant: { organizationId: ORG },
      data: { executionId: EXECUTION, workflowId: WORKFLOW, workflowVersion: 2 },
    });
  });

  it('carries the correlation id and workspace when given', () => {
    const event = createEvent(
      'execution.completed',
      { executionId: EXECUTION, workflowId: WORKFLOW },
      { ...meta, correlationId: 'req-42', tenant: { organizationId: ORG, workspaceId: WORKFLOW } },
    );

    expect(event.correlationId).toBe('req-42');
    expect(event.tenant.workspaceId).toBe(WORKFLOW);
  });

  it('round-trips through JSON', () => {
    const event = started();

    expect(parseEvent(wire(event))).toEqual(wire(event));
  });

  it('refuses to create an event whose data breaks its schema', () => {
    expect(() =>
      createEvent('execution.failed', { executionId: 'not-a-uuid', errorCode: 'X' }, meta),
    ).toThrow(EventContractError);
  });

  it.each([
    ['a missing eventId', { eventId: undefined }],
    ['a non-UUID eventId', { eventId: 'evt_1' }],
    ['a trace id that is not 32 hex characters', { traceId: 'abc' }],
    ['the all-zero trace id', { traceId: '0'.repeat(32) }],
    ['a timestamp with an offset', { occurredAt: '2026-10-08T09:00:00-03:00' }],
    ['a missing tenant', { tenant: undefined }],
    ['a non-integer version', { eventVersion: 1.5 }],
    ['an empty producer', { producer: '' }],
  ])('rejects an envelope with %s', (_, patch) => {
    expect(reason({ ...wire(started()), ...patch })).toBe('INVALID_ENVELOPE');
  });

  it('rejects input that is not an object', () => {
    expect(reason('execution.started')).toBe('INVALID_ENVELOPE');
  });

  it('rejects an event type it does not know', () => {
    expect(reason({ ...wire(started()), eventType: 'execution.teleported' })).toBe('UNKNOWN_EVENT');
  });

  it('rejects a version it does not know', () => {
    expect(reason({ ...wire(started()), eventVersion: 2 })).toBe('UNKNOWN_EVENT');
  });

  it('rejects data that does not match the version', () => {
    expect(reason({ ...wire(started()), data: { executionId: EXECUTION } })).toBe('INVALID_DATA');
  });

  it('ignores fields added by a newer producer', () => {
    const raw = wire(started());
    const parsed = parseEvent({
      ...raw,
      schemaHint: 'extra',
      data: { ...(raw['data'] as object), queuedMs: 12 },
    });

    expect(parsed.data).not.toHaveProperty('queuedMs');
    expect(parsed).not.toHaveProperty('schemaHint');
  });

  it('describes failures without echoing the payload', () => {
    const secret = 'top-secret-value';
    try {
      parseEvent({ ...wire(started()), data: { executionId: secret } });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});

describe('execution events', () => {
  it('are all version 1 of the execution lifecycle', () => {
    expect(Object.keys(EVENT_DEFINITIONS).sort()).toEqual([
      'execution.completed@1',
      'execution.failed@1',
      'execution.started@1',
      'execution.step.completed@1',
      'execution.step.failed@1',
      'execution.step.started@1',
    ]);
  });

  it('are partitioned by execution so one execution stays in order', () => {
    const events = [
      started(),
      createEvent(
        'execution.step.started',
        { executionId: EXECUTION, stepId: 'fetch', attempt: 1 },
        meta,
      ),
      createEvent(
        'execution.step.failed',
        {
          executionId: EXECUTION,
          stepId: 'fetch',
          attempt: 1,
          errorCode: 'HTTP_TIMEOUT',
          retryable: true,
        },
        meta,
      ),
      createEvent(
        'execution.step.completed',
        { executionId: EXECUTION, stepId: 'fetch', attempt: 2 },
        meta,
      ),
      createEvent('execution.failed', { executionId: EXECUTION, errorCode: 'STEP_FAILED' }, meta),
    ];

    expect(events.map(partitionKey)).toEqual(Array(events.length).fill(EXECUTION));
  });

  it('are published on the execution events topic', () => {
    expect(topicFor('execution.started')).toBe('opx.execution.events.v1');
    expect(topicFor('execution.step.failed')).toBe('opx.execution.events.v1');
  });

  it('reject an attempt below 1', () => {
    expect(() =>
      createEvent(
        'execution.step.started',
        { executionId: EXECUTION, stepId: 'a', attempt: 0 },
        meta,
      ),
    ).toThrow(EventContractError);
  });
});
