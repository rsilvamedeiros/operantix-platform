# ADR-0035 — Build one container image per workload from the monorepo

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O M09 leva os workloads para ECS/Fargate (`docs/infrastructure/ecs.md`), que executa imagens de contêiner. O repositório ainda não tinha Dockerfile algum. Há quatro processos de longa duração: `platform-api`, `workflow-worker` (com o relay do outbox como segundo entrypoint, ADR-0021), `integration-worker` e `ai-service` (Python).

## Decision

- **Uma imagem por workload.** O relay usa a imagem do `workflow-worker` com outro comando (`node dist/relay-main.js`), pois compartilha código e dependências; a tarefa de migração usa a imagem do `platform-api` (`node dist/database/migrate.js`, com as migrações em `/app/migrations`).
- **Um Dockerfile para os três workloads Node** (`Dockerfile.node`, `--build-arg APP=<pacote>`), em vez de três cópias que divergem. O ai-service tem o seu (`services/ai-service/Dockerfile`).
- **Multi-stage.** O build instala com `pnpm install --frozen-lockfile`, compila só o app e suas dependências de workspace (`turbo --filter=@operantix/<app>...`) e extrai um diretório autocontido com `pnpm deploy --prod --legacy`. A imagem final tem só isso, em `node:22-bookworm-slim`, e roda como usuário não-root (`node`; `nobody` no Python).
- **Debian slim, não Alpine**, porque o cliente Kafka (`@confluentinc/kafka-javascript`, ADR-0020) usa binário pré-compilado para glibc.
- **Versões travadas pelo lockfile** (`pnpm-lock.yaml`, `uv.lock --locked`); versões de Node e Python são argumentos de build.
- **Sem secrets na imagem.** Toda configuração entra por variável de ambiente na execução. O contexto é reduzido por `.dockerignore`.
- **CI constrói as quatro imagens a cada PR** (job `images`), sem publicar. Publicar no registro é papel do pipeline de deploy.
- Health check fica fora da imagem (a imagem não traz `curl`); o orquestrador usa `/health/live` e `/health/ready`.

## Consequences

- O diretório do app inclui `migrations/` e `dist/`; `src`, `test` e `coverage` são removidos. As imagens ficam entre 270 MB (Python) e 455 MB (workers Node).
- Todo build instala o monorepo inteiro (a camada de install é cacheável pelo BuildKit); aceitável enquanto o número de apps é pequeno.
- Mudança no Dockerfile compartilhado afeta os três workloads Node, e o CI cobre os três.
- Imagens não são assinadas nem escaneadas ainda.

## Alternatives

- Um Dockerfile por app Node: mais explícito, porém três cópias para manter sincronizadas.
- Alpine ou distroless: menores, mas o binário nativo do Kafka exige glibc e distroless complica diagnóstico.
- Imagem única para todos os workloads: acopla deploy e escala de processos distintos.

## Follow-up

Scan de vulnerabilidades e assinatura de imagem no pipeline de deploy; avaliar `docker build` com cache de registro no CI se o tempo crescer.
