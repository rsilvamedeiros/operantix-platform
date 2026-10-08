import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { eventJsonSchemas } from './json-schemas';

const DIR = join(__dirname, '..', 'schemas', 'events');

/** The committed JSON Schemas are what non-TypeScript consumers (the Python AI service) read. */
describe('committed event JSON Schemas', () => {
  const generated = eventJsonSchemas();

  it('exist for every event version and nothing else', () => {
    expect(readdirSync(DIR).sort()).toEqual(Object.keys(generated).sort());
  });

  it.each(Object.entries(generated))('%s matches the zod contract', (file, schema) => {
    const committed: unknown = JSON.parse(readFileSync(join(DIR, file), 'utf8'));

    expect(committed, 'run `pnpm --filter @operantix/contracts schemas:generate`').toEqual(schema);
  });
});
