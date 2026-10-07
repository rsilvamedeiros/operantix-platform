import { describe, expect, it } from 'vitest';
import { workflowDefinitionSchema } from './workflow-definition';

const valid = {
  schemaVersion: 1,
  trigger: { type: 'manual' },
  steps: [
    {
      id: 'fetch_status',
      name: 'Fetch status',
      type: 'http_request',
      config: { method: 'GET', url: 'https://status.example.test/api' },
    },
    { id: 'wait', name: 'Wait a bit', type: 'delay', config: { seconds: 30 } },
    { id: 'note', name: 'Note', type: 'log', config: { message: 'done' } },
  ],
};

const issuesOf = (input: unknown): string[] => {
  const result = workflowDefinitionSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('workflowDefinitionSchema', () => {
  it('accepts a linear definition with known step types', () => {
    expect(workflowDefinitionSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a schedule trigger with a five-field cron expression', () => {
    const scheduled = { ...valid, trigger: { type: 'schedule', cron: '*/5 * * * *' } };

    expect(workflowDefinitionSchema.safeParse(scheduled).success).toBe(true);
  });

  it('rejects a cron expression without five fields', () => {
    expect(issuesOf({ ...valid, trigger: { type: 'schedule', cron: '* * *' } })).toEqual([
      'trigger.cron',
    ]);
  });

  it('rejects an unknown schema version', () => {
    expect(issuesOf({ ...valid, schemaVersion: 2 })).toEqual(['schemaVersion']);
  });

  it('rejects a definition without steps', () => {
    expect(issuesOf({ ...valid, steps: [] })).toEqual(['steps']);
  });

  it('rejects more than 50 steps', () => {
    const steps = Array.from({ length: 51 }, (_, i) => ({
      id: `s${String(i)}`,
      name: 'Log',
      type: 'log',
      config: { message: 'x' },
    }));

    expect(issuesOf({ ...valid, steps })).toEqual(['steps']);
  });

  it('rejects duplicate step ids, pointing at the repeated one', () => {
    const steps = [valid.steps[0], { ...valid.steps[2], id: 'fetch_status' }];

    expect(issuesOf({ ...valid, steps })).toEqual(['steps.1.id']);
  });

  it('rejects an unknown step type', () => {
    const steps = [{ id: 'x', name: 'X', type: 'shell', config: {} }];

    expect(issuesOf({ ...valid, steps })).toEqual(['steps.0.type']);
  });

  it('rejects step config that does not match its type', () => {
    const steps = [{ id: 'wait', name: 'Wait', type: 'delay', config: { seconds: 0 } }];

    expect(issuesOf({ ...valid, steps })).toEqual(['steps.0.config.seconds']);
  });

  it('only allows http and https URLs in HTTP steps', () => {
    const steps = [
      {
        id: 'read_file',
        name: 'Read file',
        type: 'http_request',
        config: { method: 'GET', url: 'file:///etc/passwd' },
      },
    ];

    expect(issuesOf({ ...valid, steps })).toEqual(['steps.0.config.url']);
  });

  it.each(['Authorization', 'cookie', 'X-API-Key', 'Proxy-Authorization', 'x-auth-token'])(
    'rejects the credential-bearing header %s, which would be stored in plain text',
    (header) => {
      const steps = [
        {
          id: 'call',
          name: 'Call',
          type: 'http_request',
          config: { method: 'GET', url: 'https://api.example.test', headers: { [header]: 'x' } },
        },
      ];

      expect(issuesOf({ ...valid, steps })).toEqual([`steps.0.config.headers`]);
    },
  );

  it('accepts ordinary headers', () => {
    const steps = [
      {
        id: 'call',
        name: 'Call',
        type: 'http_request',
        config: {
          method: 'GET',
          url: 'https://api.example.test',
          headers: { Accept: 'text/plain' },
        },
      },
    ];

    expect(issuesOf({ ...valid, steps })).toEqual([]);
  });

  it('rejects step ids that are not lowercase identifiers', () => {
    const steps = [{ ...valid.steps[2], id: 'Not An Id' }];

    expect(issuesOf({ ...valid, steps })).toEqual(['steps.0.id']);
  });

  it('rejects unknown properties so typos do not pass silently', () => {
    expect(issuesOf({ ...valid, trigger: { type: 'manual', cronn: '* * * * *' } })).toEqual([
      'trigger',
    ]);
  });
});
