# Local Development

Objetivo: setup reproduzível com dependências mínimas. Apps rodam com hot reload; PostgreSQL/Redis em containers. Kafka entrou no M04; o stack de observability (collector, Tempo, Grafana) sobe com `docker compose --profile observability up -d`.

## Requisitos

Node 22 (`.nvmrc`), pnpm 10 (`packageManager` no `package.json`) e Docker.

## Comandos

```bash
pnpm install
docker compose up -d      # PostgreSQL e Redis
pnpm format:check && pnpm lint && pnpm typecheck && pnpm build && pnpm test
pnpm test:integration     # usa Testcontainers, não depende do compose
```

Como subir cada app: README do app (ex.: `apps/platform-api/README.md`).

O volume do PostgreSQL cria os papéis `operantix_app` e `operantix_worker` só na primeira inicialização. Se o volume é anterior a esses scripts, recrie com `docker compose down -v && docker compose up -d`.
