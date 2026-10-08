# Kafka

## Topic strategy

Começar por domínios de baixa cardinalidade, não topic por tenant.

Exemplos futuros:
- `opx.execution.commands.v1`
- `opx.execution.events.v1`
- `opx.integration.commands.v1`
- `opx.integration.events.v1`
- `opx.ai.commands.v1`

## Partition key

Escolher chave que preserve ordering necessário sem criar hotspot, normalmente `executionId` para execution lifecycle.

## Consumer groups

Cada capability independente recebe consumer group próprio.

## Operational metrics

consumer lag, processing latency, error rate, retry count, DLQ volume.

## Implemented state

- Broker local: `apache/kafka:4.1.0` em KRaft no `compose.yaml` (`localhost:9092`), sem criação automática de tópicos. O serviço `kafka-init` cria os tópicos de `infrastructure/docker/kafka/create-topics.sh`.
- Tópico ativo: `opx.execution.events.v1` (6 partições), chaveado por `executionId`.
- Cliente: `@confluentinc/kafka-javascript` (ADR-0020) no pacote `@operantix/messaging`; producer idempotente com `acks=all`, atrás de `EventPublisher`.
- Relay da outbox (ADR-0021) publica cada evento com chave = `executionId` e headers `event-id`, `event-type`, `event-version` e `traceparent`.
- Consumer: `KafkaEventConsumer` em `@operantix/messaging`, com retry topic e DLQ por consumer group (`docs/events/retry-dlq.md`). Ainda sem consumer de produção; o primeiro é o integration worker (M05).
