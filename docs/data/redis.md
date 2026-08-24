# Redis

## Allowed uses

- cache;
- distributed lock;
- rate limiting;
- short-lived deduplication/idempotency metadata;
- ephemeral coordination.

## Not allowed

Não tratar Redis como única fonte de estado de negócio crítico.

## Key convention

`opx:{environment}:{tenant?}:{domain}:{purpose}:{id}`

Definir TTL explicitamente para cache/locks. Locks precisam de owner token e expiry.
