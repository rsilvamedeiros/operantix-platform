# Platform API

NestJS API principal e core modular transacional.

## Rodar localmente

```bash
docker compose up -d          # PostgreSQL e Redis
cp .env.example .env          # na raiz; DATABASE_PASSWORD e DATABASE_MIGRATION_PASSWORD=operantix-local
pnpm install
pnpm --filter @operantix/platform-api build
set -a && . ./.env && set +a
pnpm --filter @operantix/platform-api db:migrate
pnpm --filter @operantix/platform-api start
```

## Endpoints

| Endpoint | Uso | Resposta |
| --- | --- | --- |
| `GET /health/live` | Liveness: o processo responde. Não consulta dependências. | `200 {"status":"ok"}` |
| `GET /v1/me` | Principal autenticado (requer `Authorization: Bearer <token>`). | `200 {"subject":"..."}`; `401 {"code":"UNAUTHENTICATED",...}` |
| `GET /health/ready` | Readiness: PostgreSQL (`SELECT 1`) e Redis (`PING`), cada um com timeout `HEALTH_CHECK_TIMEOUT_MS`. | `200` com todos `up`; `503` com o status de cada dependência. O motivo da falha vai só para o log. |

O Redis conecta em background com reconexão exponencial (até 5 s), então logo após o boot o readiness pode ficar `503` até a conexão subir.

## Autenticação

Toda rota exige um access token JWT válido, exceto as marcadas com `@Public()` (hoje só `/health/*`). O `AuthGuard` global valida assinatura (chaves do `AUTH_JWKS_URI`, com cache e refetch para `kid` desconhecido), `iss`, `aud`, `exp` e `sub`, e aceita só algoritmos assimétricos (RS256, PS256, ES256, EdDSA). O cliente recebe apenas `401 UNAUTHENTICATED`; o motivo da rejeição fica no log, nunca o token.

Funciona com qualquer provedor OIDC (Auth0, Keycloak, Cognito, Entra ID...). A escolha do provedor e o login no `web` ficam para quando o frontend entrar.

## Configuração

Validada na inicialização (`src/config/config.ts`); variável ausente ou inválida derruba o processo com uma mensagem que nomeia a variável sem expor o valor.

| Variável | Padrão |
| --- | --- |
| `NODE_ENV` | `development` |
| `PORT` | `3000` |
| `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | obrigatórias |
| `DATABASE_PORT` | `5432` |
| `REDIS_HOST` | obrigatória |
| `REDIS_PORT` | `6379` |
| `HEALTH_CHECK_TIMEOUT_MS` | `2000` |
| `AUTH_ISSUER`, `AUTH_JWKS_URI` | obrigatórias (URLs) |
| `AUTH_AUDIENCE` | obrigatória |

`db:migrate` usa só `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_MIGRATION_USER` e `DATABASE_MIGRATION_PASSWORD`.

## Banco de dados

Drizzle ORM com migrations SQL versionadas em `migrations/` (ADR-0017).

- Dois papéis: `operantix` é dono do schema e roda as migrations; `operantix_app` é o papel da API, sem `SUPERUSER` nem `BYPASSRLS`, com apenas `SELECT/INSERT/UPDATE/DELETE`. No compose ele é criado por `infrastructure/docker/postgres/init/10-app-role.sh` na primeira inicialização do volume.
- Tabelas com `organization_id` têm `FORCE ROW LEVEL SECURITY` e a policy `tenant_isolation`. Sem tenant definido, nenhuma linha é visível.
- Todo acesso a dados de tenant passa por `withTenant(db, organizationId, fn)`, que abre uma transação e faz `set_config('app.organization_id', ..., true)`. O valor vale só para a transação, então não vaza entre conexões do pool.
- `users` é global (uma pessoa pode estar em várias organizações) e não tem RLS.

Para mudar o schema: edite `src/**/*.schema.ts`, rode `pnpm --filter @operantix/platform-api db:generate` e revise o SQL gerado. Policies e funções vão em migration custom (`drizzle-kit generate --custom`).

## Testes

- `pnpm --filter @operantix/platform-api test`: unitários (sem infraestrutura).
- `pnpm --filter @operantix/platform-api test:integration`: integração com PostgreSQL e Redis reais via Testcontainers (requer Docker). Os testes de tenancy aplicam as migrations e conectam como um papel sem `BYPASSRLS`.
- `pnpm --filter @operantix/platform-api test:coverage`: os dois, com piso de 80%.
