# Configuration

## Principles

- Configuração por environment, validada no startup.
- Secrets separados de configuração não sensível.
- Fail fast quando configuração obrigatória estiver ausente.
- Defaults seguros apenas para desenvolvimento.

## Naming

Use prefixos claros: `DATABASE_*`, `REDIS_*`, `KAFKA_*`, `OTEL_*`, `AUTH_*`, `AI_*`.

## Environment files

`.env.example` documenta chaves, nunca valores reais. `.env`, `.env.local` e equivalentes permanecem fora do Git.
