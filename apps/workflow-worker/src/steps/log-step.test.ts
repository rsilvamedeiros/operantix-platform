import { describe, expect, it } from 'vitest';
import { LogStep } from './log-step';

describe('LogStep', () => {
  it('outputs its message', async () => {
    const output = await new LogStep().run({
      id: 'note',
      name: 'Note',
      type: 'log',
      config: { message: 'done' },
    });

    expect(output).toEqual({ message: 'done' });
  });
});
