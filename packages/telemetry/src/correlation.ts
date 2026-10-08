import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationContext {
  readonly correlationId: string;
}

export const correlationStore = new AsyncLocalStorage<CorrelationContext>();

export function runWithCorrelation<T>(context: CorrelationContext, fn: () => T): T {
  return correlationStore.run(context, fn);
}

export function currentCorrelationId(): string | undefined {
  return correlationStore.getStore()?.correlationId;
}
