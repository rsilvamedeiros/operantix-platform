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

A API de negócio fica sob `/api/v1` (`docs/api/versioning.md`). `/health/*` e `/openapi.json` ficam fora do prefixo, para probes e ferramentas não dependerem da versão.

| Endpoint | Uso | Resposta |
| --- | --- | --- |
| `GET /health/live` | Liveness: o processo responde. Não consulta dependências. | `200 {"status":"ok"}` |
| `GET /api/v1/me` | Principal autenticado (requer `Authorization: Bearer <token>`). | `200 {"subject":"..."}`; `401 {"code":"UNAUTHENTICATED",...}` |
| `GET /api/v1/organizations` | Organizações do usuário logado, com o papel em cada uma. | `200 {"data":[{"id","name","slug","role"}]}` |
| `POST /api/v1/organizations` | Cria organização `{"name","slug"}`; quem cria vira `OWNER`. Cadastra o usuário no primeiro acesso. | `201 {"id","name","slug"}`; `400 VALIDATION_FAILED`; `409 ORGANIZATION_SLUG_TAKEN` |
| `GET /api/v1/organizations/{organizationId}/workspaces` | Workspaces da organização (`workspace:read`). | `200 {"data":[{"id","name","slug","createdAt"}]}` |
| `POST /api/v1/organizations/{organizationId}/workspaces` | Cria workspace `{"name","slug"}` e registra auditoria (`workspace:create`). | `201` com o workspace; `400 VALIDATION_FAILED`; `409 WORKSPACE_SLUG_TAKEN` |
| `GET /api/v1/organizations/{organizationId}/workspaces/{workspaceId}/workflows` | Workflows do workspace (`workflow:read`). | `200 {"data":[workflow]}`; `404 WORKSPACE_NOT_FOUND` |
| `POST /api/v1/organizations/{organizationId}/workspaces/{workspaceId}/workflows` | Cria workflow `{"name","key","definition"}` com a versão 1 (`workflow:write`). | `201` workflow; `400 VALIDATION_FAILED`; `404 WORKSPACE_NOT_FOUND`; `409 WORKFLOW_KEY_TAKEN` |
| `GET /api/v1/organizations/{organizationId}/workflows/{workflowId}` | Workflow com o resumo das versões, da mais nova para a mais antiga (`workflow:read`). | `200`; `404 WORKFLOW_NOT_FOUND` |
| `POST /api/v1/organizations/{organizationId}/workflows/{workflowId}/versions` | Publica nova versão `{"definition"}` (`workflow:write`). | `201 {"workflowId","version","definition","createdBy","createdAt"}`; `404 WORKFLOW_NOT_FOUND` |
| `PUT /api/v1/organizations/{organizationId}/workflows/{workflowId}/activation` | Ativa uma versão `{"version"}` (`workflow:activate`). Reativar a versão ativa não muda nada. | `200` workflow; `404 WORKFLOW_VERSION_NOT_FOUND` |
| `DELETE /api/v1/organizations/{organizationId}/workflows/{workflowId}/activation` | Desativa (`workflow:activate`); idempotente. | `200` workflow com `activeVersion: null` |
| `GET /api/v1/organizations/{organizationId}/workflows/{workflowId}/versions/{version}` | Uma versão com a definição completa (`workflow:read`). | `200`; `404 WORKFLOW_VERSION_NOT_FOUND` |
| `POST /api/v1/organizations/{organizationId}/workflows/{workflowId}/executions` | Inicia uma execução da versão ativa `{"input"}` (`execution:start`). Header opcional `Idempotency-Key`. | `201` execução com steps; `200` replay da mesma chave; `409 WORKFLOW_INACTIVE`; `409 IDEMPOTENCY_KEY_REUSED` |
| `GET /api/v1/organizations/{organizationId}/workflows/{workflowId}/executions` | Execuções do workflow, da mais nova para a mais antiga, com `?limit=` (1 a 100, padrão 20) e `?cursor=` (`execution:read`). | `200 {"data","nextCursor"}`; `400 VALIDATION_FAILED` |
| `GET /api/v1/organizations/{organizationId}/executions/{executionId}` | Execução com os steps na ordem da definição (`execution:read`). | `200`; `404 EXECUTION_NOT_FOUND` |
| `GET /api/v1/organizations/{organizationId}/executions/{executionId}/timeline` | O que aconteceu com a execução, do mais antigo ao mais novo (`execution:read`). | `200 {"data":[{"type","stepId","attempt","details","occurredAt"}]}`; `404 EXECUTION_NOT_FOUND` |
| `GET /health/ready` | Readiness: PostgreSQL (`SELECT 1`) e Redis (`PING`), cada um com timeout `HEALTH_CHECK_TIMEOUT_MS`. | `200` com todos `up`; `503` com o status de cada dependência. O motivo da falha vai só para o log. |

O Redis conecta em background com reconexão exponencial (até 5 s), então logo após o boot o readiness pode ficar `503` até a conexão subir.

## Autenticação

Toda rota exige um access token JWT válido, exceto as marcadas com `@Public()` (hoje só `/health/*`). O `AuthGuard` global valida assinatura (chaves do `AUTH_JWKS_URI`, com cache e refetch para `kid` desconhecido), `iss`, `aud`, `exp` e `sub`, e aceita só algoritmos assimétricos (RS256, PS256, ES256, EdDSA). O cliente recebe apenas `401 UNAUTHENTICATED`; o motivo da rejeição fica no log, nunca o token.

Funciona com qualquer provedor OIDC (Auth0, Keycloak, Cognito, Entra ID...). A escolha do provedor e o login no `web` ficam para quando o frontend entrar.

## Contrato OpenAPI

`GET /openapi.json` (público) serve o documento OpenAPI 3.1, gerado de `src/openapi/openapi.document.ts`. Os schemas de request são os mesmos zod que validam a entrada, e os de response ficam em `src/openapi/responses.ts`.

- Um teste unitário garante que o documento lista exatamente as rotas dos controllers e que `openapi.json` (commitado) está igual ao que o código serve. Mudou o contrato: rode `pnpm --filter @operantix/platform-api build && pnpm --filter @operantix/platform-api openapi:generate` e o diff aparece no PR.
- Um teste de integração percorre o fluxo principal e valida cada resposta real contra o schema documentado para aquele status.
- `x-permission` em cada operação indica a permissão exigida.

## Autorização e tenant

O `AuthorizationGuard` global roda depois do `AuthGuard`. Em rotas com `:organizationId`, ele busca a membership do `sub` do token naquela organização e monta o `TenantContext` (`organizationId`, `userId`, `role`), lido no controller com `@CurrentTenant()`. O tenant nunca vem do body.

- Não membro, organização inexistente ou id inválido: `404 ORGANIZATION_NOT_FOUND` (a existência de outros tenants não vaza).
- Papel sem a permissão da rota: `403 FORBIDDEN`.
- Deny by default: rota com `:organizationId` sem `@RequirePermission(...)` é negada; `@RequirePermission` em rota sem organização também.
- Rotas sem organização (ex.: `/api/v1/me`) só exigem autenticação.

| Permissão | OWNER | ADMIN | DEVELOPER | OPERATOR | VIEWER |
| --- | --- | --- | --- | --- | --- |
| `workspace:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `workspace:create` | ✓ | ✓ | | | |
| `workflow:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `workflow:write` | ✓ | ✓ | ✓ | | |
| `workflow:activate` | ✓ | ✓ | ✓ | ✓ | |
| `execution:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `execution:start` | ✓ | ✓ | ✓ | ✓ | |
| `integration:read` | ✓ | ✓ | ✓ | ✓ | |
| `integration:write` | ✓ | ✓ | ✓ | | |

A matriz fica em `src/authorization/permissions.ts`.

## Workflows

Um workflow pertence a um workspace e tem versões numeradas a partir de 1. Cada versão guarda a definição validada e é imutável (trigger no banco rejeita `UPDATE`): mudar a definição é publicar uma versão nova. O número vem de um contador na linha do workflow, incrementado sob lock, então escritas concorrentes recebem números distintos. `activeVersion` é a versão que novas execuções vão usar; `null` enquanto inativo. Ativar e desativar leem o workflow com `FOR UPDATE` e auditam `workflow.activated` (`version`, `previousVersion`) e `workflow.deactivated`; operações sem efeito não geram auditoria. Uma FK `(id, active_version) → workflow_versions (workflow_id, version)` garante no banco que a versão ativa existe. OPERATOR pode ativar, mas não editar definições.

Definição (`src/workflows/workflow-definition.ts`, `schemaVersion: 1`):

```json
{
  "schemaVersion": 1,
  "trigger": { "type": "manual" },
  "steps": [
    { "id": "check", "name": "Check", "type": "http_request", "config": { "method": "GET", "url": "https://status.example.com" } },
    { "id": "wait", "name": "Wait", "type": "delay", "config": { "seconds": 30 } },
    { "id": "note", "name": "Note", "type": "log", "config": { "message": "done" } }
  ]
}
```

- `trigger`: `manual` ou `schedule` (`cron` com 5 campos).
- `steps`: 1 a 50, executados em ordem; `id` minúsculo e único. Tipos: `http_request` (só `http`/`https`; a política de destino contra SSRF fica na execução), `delay` (1 s a 24 h), `log`.
- Headers de credencial (`Authorization`, `Proxy-Authorization`, `Cookie`, `X-API-Key`, `X-Auth-Token`) são rejeitados: a definição fica em texto puro e qualquer papel lê. Referências a secrets entram com as integrações (M05).
- Propriedades desconhecidas são rejeitadas, para erro de digitação não passar em silêncio.

Workflows e versões têm RLS e chaves estrangeiras compostas com `organization_id`, então uma linha nunca aponta para o pai de outro tenant (FK comum é checada sem RLS).

## Execuções

Steps têm os estados `PENDING`, `RUNNING`, `WAITING` (step `delay` aguardando, sem ocupar worker), `SUCCEEDED`, `FAILED` e `SKIPPED`.

Iniciar uma execução congela a versão ativa (`workflowVersion`) e cria um `step_execution` `PENDING` por step, na ordem da definição. A execução nasce `PENDING`, e na mesma transação entra um job em `execution_jobs` para o worker; quem a move é o `workflow-worker`. Um replay idempotente não enfileira de novo. As transições válidas ficam em `src/executions/execution-state.ts`: `PENDING → RUNNING | CANCELLED` e `RUNNING → SUCCEEDED | FAILED | CANCELLED`; estados finais não mudam.

Idempotência (`docs/api/idempotency.md`): com `Idempotency-Key`, a chave é única por workflow (índice único `(organization_id, workflow_id, idempotency_key)`) e guarda o SHA-256 do body canônico. Repetir a chave com o mesmo body devolve a primeira execução com `200`; com body diferente, `409 IDEMPOTENCY_KEY_REUSED`. Requisições concorrentes com a mesma chave usam `INSERT ... ON CONFLICT DO NOTHING`, então só uma cria a execução e as outras recebem a mesma.

Timeline: `execution_events` é append-only (trigger rejeita `UPDATE`/`DELETE` diretos; apagar a execução leva os eventos junto). A API grava `execution.created` na transação do start; o worker grava, na mesma transação de cada mudança, `execution.started`, `step.started`, `step.resumed`, `step.waiting`, `step.succeeded`, `step.failed` (`details: {code, retryable}`, sem a mensagem), `step.retry_scheduled` (`details.runAfter`), `execution.succeeded` e `execution.failed` (`details.code`). O papel do worker só tem `INSERT` nessa tabela, sem leitura.

A listagem usa keyset pagination em `(created_at desc, id desc)`. O cursor é opaco; um cursor inválido devolve `400`.

## Webhook endpoints

Uma organização registra para onde seus eventos de execução vão (`POST /api/v1/organizations/{organizationId}/webhook-endpoints`): `url` (`http`/`https`, sem credenciais na URL), `eventTypes` (um ou mais tipos de `@operantix/contracts`, sem repetição) e `description` opcional. A resposta traz `signingSecret` (`whsec_...`) uma única vez; listar e ler nunca o devolvem. `POST .../{endpointId}/rotate-secret` troca o secret na hora e devolve o novo; `PUT .../{endpointId}/status` ativa ou desativa (reativar zera `consecutiveFailures`); `DELETE` apaga o endpoint e o secret. Criar, rotacionar, mudar status e apagar são auditados, sem o secret.

`GET .../{endpointId}/deliveries` lista as entregas (keyset, mais novas primeiro), `GET .../deliveries/{deliveryId}` mostra as tentativas, e `POST .../deliveries/{deliveryId}/retry` devolve uma entrega que falhou para a fila (`docs/api/webhooks.md`). As tabelas são escritas pelo integration worker; a API só lê e reenfileira.

O secret fica em `secrets`, cifrado com AES-256-GCM pelo keyring de `SECRETS_ENCRYPTION_KEYS` e preso ao tenant e à linha (ADR-0022). A API só cifra. Viewers não veem endpoints, porque URLs podem carregar tokens; operators leem, mas não alteram. A entrega dos eventos é do integration worker.

## Connections

`/api/v1/organizations/{organizationId}/connections` guarda credenciais para passos HTTP (ADR-0025): `name` (identificador único na organização), `baseUrl` (`http`/`https`, sem credenciais, query ou fragmento) e `auth`, que é `{"type":"bearer","token":"..."}` ou `{"type":"header","headerName":"X-Api-Key","value":"..."}`. A credencial vai para `secrets` (`CONNECTION_CREDENTIAL`) e nunca volta pela API; `PUT .../{connectionId}/credential` troca a credencial, e `DELETE` apaga a connection e o secret. Ler exige `integration:read`; o resto, `integration:write`. Tudo é auditado, sem o valor.

## Inbound webhooks

`/api/v1/organizations/{organizationId}/inbound-webhooks` cria, lista, lê, rotaciona e apaga URLs assinadas que iniciam um workflow (`integration:read` para ler, `integration:write` para o resto). A rota pública `POST /hooks/v1/{organizationId}/{inboundWebhookId}` não usa token: verifica `Operantix-Signature` sobre o corpo cru (o app mantém `rawBody`), exige `Idempotency-Key` e inicia a execução com `triggerType: "webhook"` (ADR-0024, `docs/api/webhooks.md`). É o único lugar em que a API abre um secret, e só do tipo `WEBHOOK_INBOUND`.

## Auditoria

`recordAudit(tx, tenant, event)` grava em `audit_entries` na mesma transação da mudança, então a entrada existe se e somente se a mudança foi commitada. A tabela tem RLS por tenant e um trigger que rejeita `UPDATE` e `DELETE` (append-only). Ações seguem `<recurso>.<verbo no passado>`, ex.: `workspace.created`.

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
| `SECRETS_ENCRYPTION_KEYS` | obrigatória; `id:base64` (32 bytes), separadas por vírgula, a ativa primeiro (ADR-0022) |

`db:migrate` usa só `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_MIGRATION_USER` e `DATABASE_MIGRATION_PASSWORD`.

## Banco de dados

Drizzle ORM com migrations SQL versionadas em `migrations/` (ADR-0017).

- Dois papéis: `operantix` é dono do schema e roda as migrations; `operantix_app` é o papel da API, sem `SUPERUSER` nem `BYPASSRLS`, com apenas `SELECT/INSERT/UPDATE/DELETE`. No compose ele é criado por `infrastructure/docker/postgres/init/10-app-role.sh` na primeira inicialização do volume.
- Tabelas com `organization_id` têm `FORCE ROW LEVEL SECURITY` e a policy `tenant_isolation`. Sem tenant definido, nenhuma linha é visível.
- Todo acesso a dados de tenant passa por `withTenant(db, organizationId, fn)`, que abre uma transação e faz `set_config('app.organization_id', ..., true)`. O valor vale só para a transação, então não vaza entre conexões do pool.
- `users` é global (uma pessoa pode estar em várias organizações) e não tem RLS. O registro é criado no primeiro `POST /api/v1/organizations` a partir do `sub` do token; `email` e `name` vêm do token quando presentes.
- `operantix_worker` é o papel do `workflow-worker` (ADR-0018, ADR-0019). Ele vê a fila `execution_jobs` de todos os tenants (policy `worker_queue`), lê e atualiza execuções e steps só dentro de `withTenant`, só insere em `execution_events` e não tem acesso às outras tabelas. A migration cria o papel sem `LOGIN`; no compose, `init/20-worker-role.sh` define `LOGIN` e senha.
- `withUser(db, userId, fn)` abre um escopo só de leitura em que o usuário vê as próprias memberships e as organizações a que pertence, em todos os tenants (policies `member_reads_own`, `FOR SELECT`). Escritas continuam exigindo `withTenant`.

Para mudar o schema: edite `src/**/*.schema.ts`, rode `pnpm --filter @operantix/platform-api db:generate` e revise o SQL gerado. Policies e funções vão em migration custom (`drizzle-kit generate --custom`).

## Testes

- `pnpm --filter @operantix/platform-api test`: unitários (sem infraestrutura).
- `pnpm --filter @operantix/platform-api test:integration`: integração com PostgreSQL e Redis reais via Testcontainers (requer Docker). Os testes de tenancy aplicam as migrations e conectam como um papel sem `BYPASSRLS`.
- `pnpm --filter @operantix/platform-api test:coverage`: os dois, com piso de 80%.
