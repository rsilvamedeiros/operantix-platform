import { z } from 'zod';
import { envelopeSchema } from './events/envelope';
import { EVENT_DEFINITIONS } from './events/events';

/**
 * One JSON Schema per event version (`execution.started.v1.json`), envelope included, for
 * consumers that cannot import the zod contracts.
 */
export function eventJsonSchemas(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(EVENT_DEFINITIONS).map(([key, data]) => {
      const [type = key, version = ''] = key.split('@');
      const schema = envelopeSchema.extend({
        eventType: z.literal(type),
        eventVersion: z.literal(Number(version)),
        data,
      });
      return [`${type}.v${version}.json`, z.toJSONSchema(schema)];
    }),
  );
}
