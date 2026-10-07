import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOpenApiDocument } from './openapi.document';

// Writes the committed contract (apps/platform-api/openapi.json); a unit test fails while it
// differs from what the code would serve.
const target = resolve(__dirname, '../../openapi.json');
writeFileSync(target, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);
console.log(`Wrote ${target}`);
