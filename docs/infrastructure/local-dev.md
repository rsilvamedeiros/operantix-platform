# Local Development

Objetivo: setup reproduzível com dependências mínimas. Apps rodam com hot reload; PostgreSQL/Redis em containers. Kafka e observability stack entram nos módulos correspondentes via Compose profiles.

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

O volume do PostgreSQL cria o papel `operantix_app` só na primeira inicialização. Se o volume é anterior a esse script, recrie com `docker compose down -v && docker compose up -d`.
