# PostgreSQL

## Role

Source of truth das aggregates transacionais.

## Modeling

- UUID/ULID conforme decisão de implementação consistente.
- timestamps UTC.
- constraints no banco para invariantes estruturais.
- índices derivados de queries reais.
- foreign keys dentro do mesmo ownership boundary quando apropriado.
- optimistic concurrency onde concorrência de atualização for relevante.

## Multi-tenancy

Tenant/workspace discriminator indexado. Composite indexes devem considerar o tenant primeiro quando refletir o access pattern.

## Transactions

Use transação curta. Não segure transação enquanto chama provider externo. Para publicar evento decorrente de mudança transacional, usar Outbox Pattern quando Kafka estiver ativo.
