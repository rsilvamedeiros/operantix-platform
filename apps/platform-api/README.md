# Platform API

NestJS API principal e core modular transacional.

## Rodar localmente

```bash
docker compose up -d          # PostgreSQL e Redis
cp .env.example .env          # na raiz; ajuste DATABASE_PASSWORD para operantix-local
pnpm install
pnpm --filter @operantix/platform-api build
set -a && . ./.env && set +a && pnpm --filter @operantix/platform-api start
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

## Testes

- `pnpm --filter @operantix/platform-api test`: unitários (sem infraestrutura).
- `pnpm --filter @operantix/platform-api test:integration`: integração com PostgreSQL e Redis reais via Testcontainers (requer Docker).
- `pnpm --filter @operantix/platform-api test:coverage`: os dois, com piso de 80%.
