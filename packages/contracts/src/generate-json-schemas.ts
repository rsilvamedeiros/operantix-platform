import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eventJsonSchemas } from './json-schemas';

const dir = join(__dirname, '..', 'schemas', 'events');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
for (const [file, schema] of Object.entries(eventJsonSchemas())) {
  writeFileSync(join(dir, file), `${JSON.stringify(schema, null, 2)}\n`);
}
