# Messaging Package

Adapters Kafka compartilhados entre workloads (ADR-0020). O código de aplicação depende das abstrações (`EventPublisher`), não do cliente.

- `KafkaEventPublisher`: producer idempotente com `acks=all`; conecta no primeiro uso.
- `KafkaEventConsumer`: consome eventos de contrato com retry topic e DLQ (`docs/events/retry-dlq.md`). O handler recebe `{event, attempt, topic}` e precisa ser idempotente (`docs/events/idempotency.md`); `PermanentError(code)` manda o evento direto para a DLQ.

```ts
const consumer = new KafkaEventConsumer(
  {
    brokers: ['localhost:9092'],
    clientId: 'integration-worker',
    groupId: 'opx.integration-worker',
    topics: ['opx.execution.events.v1'],
    retryTopic: 'opx.integration-worker.retry',
    deadLetterTopic: 'opx.integration-worker.dlq',
    retry: { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 },
  },
  async ({ event }) => handle(event),
  publisher,
);
await consumer.start();
```

## Testes

```bash
pnpm --filter @operantix/messaging test            # unit
pnpm --filter @operantix/messaging test:coverage   # unit + integração com Kafka (Testcontainers)
```
