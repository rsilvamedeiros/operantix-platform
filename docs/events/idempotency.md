# Idempotency

## HTTP

Endpoints de criação/trigger críticos aceitam `Idempotency-Key` quando o cliente puder repetir request.

## Consumers

Persistir `eventId`/operation key ou usar state transition protegida para impedir side effects duplicados.

O relay da outbox e o `KafkaEventConsumer` entregam at-least-once: um crash entre o efeito e o commit do offset, ou um retry, entrega o mesmo `eventId` de novo. O handler registra o `eventId` na mesma transação do efeito (ex.: tabela `processed_events` com PK por consumer + `eventId`) e trata duplicata como sucesso.

## External calls

Usar provider idempotency key quando suportado. Se não suportado, registrar attempt e reconciliar efeitos.

## Principle

Idempotência é feature de negócio/infra combinada; Redis TTL sozinho não é suficiente para efeitos permanentes críticos.
