import type { KafkaJS } from '@confluentinc/kafka-javascript';

export type Headers = Record<string, string>;

export interface Source {
  topic: string;
  partition: string;
  offset: string;
}

export const RETRY_HEADER = {
  attempt: 'retry-attempt',
  notBefore: 'retry-not-before',
  sourceTopic: 'source-topic',
  sourcePartition: 'source-partition',
  sourceOffset: 'source-offset',
} as const;

const RETRY_HEADER_NAMES: readonly string[] = Object.values(RETRY_HEADER);

/** Kafka headers as strings; repeated headers are joined with commas, empty ones dropped. */
export function decodeHeaders(headers: KafkaJS.IHeaders | undefined): Headers {
  const decoded: Headers = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value === undefined) continue;
    decoded[name] = Array.isArray(value) ? value.map(String).join(',') : String(value);
  }
  return decoded;
}

export function messageKey(key: Buffer | string | null | undefined): string {
  return key ? String(key) : '';
}

/** When a retried event is due (epoch ms); 0, meaning now, when the header is missing or garbled. */
export function dueAt(headers: Headers): number {
  const value = Number(headers[RETRY_HEADER.notBefore]);
  return Number.isFinite(value) ? value : 0;
}

/** Where a retried event was first consumed, falling back to the retry topic itself. */
export function retrySource(headers: Headers, retryTopic: string): Source {
  return {
    topic: headers[RETRY_HEADER.sourceTopic] ?? retryTopic,
    partition: headers[RETRY_HEADER.sourcePartition] ?? '',
    offset: headers[RETRY_HEADER.sourceOffset] ?? '',
  };
}

/** The headers without the consumer's own retry bookkeeping. */
export function withoutRetryHeaders(headers: Headers): Headers {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !RETRY_HEADER_NAMES.includes(name)),
  );
}
