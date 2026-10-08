import { isWithinBaseUrl } from '@operantix/http-client';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Transaction } from '../database/database';
import type { WorkflowDefinition } from '../workflows/workflow-definition';
import { workflows, workflowVersions } from '../workflows/workflows.schema';
import { connections } from './connections.schema';

/** Steps whose connection is unknown to the tenant or does not cover the step's URL. */
export class StepConnectionError extends Error {
  override name = 'StepConnectionError';

  /** Paths inside the definition, like `steps.0.config.connectionId`. */
  constructor(readonly fields: string[]) {
    super(`Invalid step connections: ${fields.join(', ')}`);
  }
}

/**
 * Checks, in the caller's tenant transaction, that every HTTP step's connection exists and
 * that the step URL lies inside its base URL (ADR-0025). The worker checks again at run time.
 */
export async function assertStepConnections(
  tx: Transaction,
  definition: WorkflowDefinition,
): Promise<void> {
  const uses = definition.steps.flatMap((step, index) =>
    step.type === 'http_request' && step.config.connectionId !== undefined
      ? [{ index, url: step.config.url, connectionId: step.config.connectionId }]
      : [],
  );
  if (uses.length === 0) return;
  const found = await tx
    .select({ id: connections.id, baseUrl: connections.baseUrl })
    .from(connections)
    .where(inArray(connections.id, [...new Set(uses.map((u) => u.connectionId))]));
  const baseUrls = new Map(found.map((c) => [c.id, c.baseUrl]));
  const invalid = uses.filter((use) => {
    const baseUrl = baseUrls.get(use.connectionId);
    return baseUrl === undefined || !isWithinBaseUrl(new URL(use.url), baseUrl);
  });
  if (invalid.length > 0) {
    throw new StepConnectionError(
      invalid.map((u) => `steps.${String(u.index)}.config.connectionId`),
    );
  }
}

/** Whether an active workflow version has a step that uses the connection. */
export async function isUsedByActiveVersion(
  tx: Transaction,
  connectionId: string,
): Promise<boolean> {
  const step = JSON.stringify([{ config: { connectionId } }]);
  const [used] = await tx
    .select({ workflowId: workflows.id })
    .from(workflows)
    .innerJoin(
      workflowVersions,
      and(
        eq(workflowVersions.workflowId, workflows.id),
        eq(workflowVersions.version, workflows.activeVersion),
      ),
    )
    .where(
      and(
        isNotNull(workflows.activeVersion),
        sql`${workflowVersions.definition} -> 'steps' @> ${step}::jsonb`,
      ),
    )
    .limit(1);
  return used !== undefined;
}
