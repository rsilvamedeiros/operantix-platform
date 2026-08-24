# Multi-tenancy Architecture

## Initial model

Shared application + shared PostgreSQL, com tenant discriminator e controles de aplicação. Row-level security poderá ser avaliado em fase posterior.

## Core rules

- Toda entidade tenant-bound carrega identificador de tenant/workspace adequado.
- Repositories recebem TenantContext explicitamente.
- Query sem tenant filter em tabela tenant-bound é defeito de segurança.
- Cache keys incluem tenant.
- Event envelope inclui tenant context quando aplicável.
- Metrics devem evitar tenant labels de cardinalidade descontrolada.

## Future isolation tiers

Clientes enterprise podem demandar database/schema dedicado. Essa evolução exige ADR e tooling de provisioning.
