import { describe, expect, it } from 'vitest';
import type { WorkflowStep } from '../engine.schema';
import { StepDispatcher, UnsupportedStepError } from './step-dispatcher';
import type { StepContext, StepHandler } from './step-handler';

const context: StepContext = {
  organizationId: 'org',
  executionId: 'exec',
  input: {},
  stepStartedAt: new Date(),
};
const step = (type: string): WorkflowStep => ({ id: 's1', name: 'S1', type, config: {} });

describe('StepDispatcher', () => {
  it('runs the handler registered for the step type', async () => {
    const echo: StepHandler = {
      type: 'echo',
      run: (s, c) => Promise.resolve({ step: s.id, execution: c.executionId }),
    };
    const dispatcher = new StepDispatcher([echo]);

    await expect(dispatcher.dispatch(step('echo'), context)).resolves.toEqual({
      step: 's1',
      execution: 'exec',
    });
  });

  it('rejects a step type no handler supports', async () => {
    const dispatcher = new StepDispatcher([]);

    await expect(dispatcher.dispatch(step('teleport'), context)).rejects.toThrow(
      UnsupportedStepError,
    );
  });

  it('refuses two handlers for the same type', () => {
    const handler: StepHandler = { type: 'echo', run: () => Promise.resolve(null) };

    expect(() => new StepDispatcher([handler, handler])).toThrow(/echo/);
  });
});
