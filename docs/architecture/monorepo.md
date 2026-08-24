# Monorepo Strategy

## Decision

Um repositório `operantix-platform`, com deploy independente por workload.

## Tooling target

- pnpm workspaces.
- Turborepo para task graph/cache quando a base TypeScript estiver criada.
- Python gerenciado separadamente dentro de `services/ai-service`.

## Boundaries

`apps/` contém workloads TypeScript executáveis. `services/` contém serviços especializados com runtime independente. `packages/` contém código compartilhável sem ownership de dados.

## What must not be shared

- ORM repositories entre serviços.
- acesso irrestrito a tabelas alheias.
- secrets.
- domain internals como pacote "common" genérico.

## Extraction criteria

Separar repositório somente quando release lifecycle, ownership organizacional, segurança, distribuição pública ou escala de CI justificarem.
