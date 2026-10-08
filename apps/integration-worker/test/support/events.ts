import { randomUUID } from 'node:crypto';
import { type AnyEvent, createEvent } from '@operantix/contracts';

export function completedEvent(organizationId: string): AnyEvent {
  const executionId = randomUUID();
  return createEvent(
    'execution.completed',
    { executionId, workflowId: randomUUID() },
    {
      eventId: randomUUID(),
      occurredAt: new Date(),
      producer: 'workflow-worker',
      traceId: executionId.replaceAll('-', ''),
      tenant: { organizationId },
    },
  );
}
