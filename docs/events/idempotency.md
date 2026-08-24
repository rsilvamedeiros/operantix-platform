# Idempotency

## HTTP

Endpoints de criação/trigger críticos aceitam `Idempotency-Key` quando o cliente puder repetir request.

## Consumers

Persistir `eventId`/operation key ou usar state transition protegida para impedir side effects duplicados.

## External calls

Usar provider idempotency key quando suportado. Se não suportado, registrar attempt e reconciliar efeitos.

## Principle

Idempotência é feature de negócio/infra combinada; Redis TTL sozinho não é suficiente para efeitos permanentes críticos.
