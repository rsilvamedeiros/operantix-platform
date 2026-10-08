# Messaging Package

Adapters Kafka compartilhados entre workloads (ADR-0020). O código de aplicação depende das abstrações (`EventPublisher`), não do cliente.

- `KafkaEventPublisher`: producer idempotente com `acks=all`; conecta no primeiro uso.
