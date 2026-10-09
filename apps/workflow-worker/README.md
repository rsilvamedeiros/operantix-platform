# Workflow Worker

Worker NestJS que executa as execuções criadas pelo `platform-api` (M03). Não expõe HTTP: é um application context que consome a fila `execution_jobs` no PostgreSQL (ADR-0018, ADR-0019).

## Rodar localmente

```bash
docker compose up -d postgres
pnpm --filter @operantix/platform-api db:migrate   # o schema é do platform-api
pnpm --filter @operantix/workflow-worker build
pnpm --filter @operantix/workflow-worker start
```

## Configuração

Validada na inicialização (`src/config.ts`); variável inválida derruba o processo com o nome da variável, nunca o valor.

| Variável | Padrão |
| --- | --- |
| `NODE_ENV` | `development` |
| `DATABASE_HOST`, `DATABASE_NAME` | obrigatórias (as mesmas do `platform-api`) |
| `DATABASE_PORT` | `5432` |
| `WORKER_DATABASE_USER`, `WORKER_DATABASE_PASSWORD` | obrigatórias; papel `operantix_worker`, nunca o da API |
| `WORKER_ID` | `<hostname>-<pid>` |
| `WORKER_BATCH_SIZE` | `5` (máx. 100) |
| `WORKER_POLL_INTERVAL_MS` | `1000` |
| `WORKER_LEASE_SECONDS` | `60` |
| `WORKER_HTTP_TIMEOUT_MS` | `10000`; precisa ser menor que o lease |
| `WORKER_HTTP_ALLOW_PRIVATE_NETWORKS` | `false`; `true` é recusado com `NODE_ENV=production` |
| `WORKER_HTTP_MAX_RESPONSE_BYTES` | `65536` (máx. 1 MiB) |
| `WORKER_STEP_MAX_ATTEMPTS` | `3` (máx. 10) |
| `WORKER_RETRY_BASE_DELAY_MS` | `2000` |
| `SECRETS_ENCRYPTION_KEYS` | obrigatória; o mesmo keyring do `platform-api`, para abrir credenciais de connections (ADR-0025) |
| `AI_SERVICE_URL` | sem valor; sem ela, steps `ai_classify` falham com `AI_SERVICE_NOT_CONFIGURED` |
| `AI_SERVICE_TOKEN` | obrigatória com `AI_SERVICE_URL`; o mesmo `AI_SERVICE_TOKEN` do `services/ai-service` (ADR-0028), mínimo de 32 caracteres |
| `WORKER_AI_TIMEOUT_MS` | `45000`; precisa ser menor que o lease. Deixe acima de timeout × (retries + 1) do AI service, senão uma chamada lenta é cortada e tentada de novo |

## Como funciona

1. **Claim** (`src/queue/job-queue.ts`): um único `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)` faz lease de até `WORKER_BATCH_SIZE` jobs vencidos (`run_after <= now()`) e sem lease ativo, e incrementa `attempts`. Workers concorrentes recebem lotes disjuntos.
2. **Run** (`src/execution/execution-runner.ts`): tudo dentro de `withTenant` com a organização do job. A execução vai de `PENDING` para `RUNNING`, cada step roda em ordem e o resultado é commitado antes do próximo. Steps já `SUCCEEDED` são pulados, então um worker que morre no meio deixa um estado retomável.
   - **Renovação do lease** (ADR-0034): o lote inteiro é arrendado no claim, mas roda em sequência. Enquanto o lote está em andamento, os leases dos jobs ainda não terminados são renovados a cada `WORKER_LEASE_SECONDS / 3`, e antes de cada job o worker confere que ainda o detém; um job cujo lease passou para outro worker é pulado.
3. **Complete**: quando a execução chega a um estado final, o job é apagado. Se o run lança (ex.: banco caiu), o job fica com o lease, que expira, e outro claim tenta de novo.

Cada mudança de estado grava um evento em `execution_events` na mesma transação; a API expõe isso como timeline (`GET .../executions/{id}/timeline`, ver o README do `platform-api`).

Na mesma transação, as mudanças do ciclo de vida também viram eventos de contrato (`@operantix/contracts`) em `outbox_events`: `execution.started`, `execution.step.started`, `execution.step.completed`, `execution.step.failed` (com `errorCode` e `retryable`, sem mensagem), `execution.completed` e `execution.failed`. Esperas e retomadas de `delay` ficam só na timeline. Cada linha guarda o envelope completo, o topic (`opx.execution.events.v1`) e a partition key (`executionId`). Até o OpenTelemetry (M07), o `traceId` é o `executionId` sem hífens, então todos os eventos de uma execução compartilham o trace. A publicação no Kafka é do relay da outbox (abaixo).

Step `ai_classify` (`src/steps/ai-classify-step.ts`): lê o campo `inputField` do input da execução (caminho com pontos, só propriedades próprias) e chama `POST /v1/classifications` do AI service com os `labels` do step e a organização. A saída do step é `{label, confidence, promptVersion, model, usage}`. Campo ausente, vazio, que não é texto ou com mais de 20.000 caracteres falha permanente com `STEP_INPUT_INVALID`, sem copiar o texto no erro. Do AI service, só `LLM_UNAVAILABLE` (503), timeout e falha de conexão são retentáveis; `LLM_REFUSED`, `LLM_OUTPUT_INVALID`, `LLM_REJECTED` e token recusado (`AI_SERVICE_UNAUTHORIZED`) falham o step. O teste `ai-service-contract.test.ts` confere o cliente contra o `services/ai-service/openapi.json`.

Regras:

- Falha retentável (`retryable: true`: timeout, conexão recusada, `408/425/429/5xx`): enquanto o step tiver tentativas (`WORKER_STEP_MAX_ATTEMPTS`), ele volta a `PENDING` com o erro registrado e o job é reagendado com backoff exponencial (`WORKER_RETRY_BASE_DELAY_MS × 2^(tentativa-1)`, até 15 min). O reagendamento zera o contador de claims do job, que só conta crashes.
- Falha permanente, ou retentável sem tentativas restantes: o step fica `FAILED` com `error.code` (ex.: `HTTP_STATUS`, `DESTINATION_BLOCKED`, `STEP_TYPE_NOT_SUPPORTED`, `STEP_ERROR`), os seguintes ficam `SKIPPED` e a execução fica `FAILED` com `{code: 'STEP_FAILED', stepId}`. Erro não classificado é tratado como permanente.
- Job com mais claims que `max_attempts` (padrão 5): a execução fica `FAILED` com `MAX_ATTEMPTS_EXCEEDED`. Isso evita que uma execução que derruba o worker seja tentada para sempre.
- Execução cancelada: o worker para antes do próximo step.
- Shutdown (`SIGTERM`/`SIGINT`): para de buscar jobs e termina o lote em andamento.

## Relay da outbox

Segundo entrypoint do mesmo app (ADR-0021), rodado como processo próprio:

```bash
docker compose up -d postgres kafka kafka-init
pnpm --filter @operantix/workflow-worker build
pnpm --filter @operantix/workflow-worker start:relay
```

- Conecta como `operantix_relay`, que só lê, marca e apaga linhas de `outbox_events`.
- Só uma instância publica por vez: a que tem o advisory lock `operantix:outbox-relay`. As outras ficam em standby e assumem quando a conexão do líder cai.
- A cada tick, publica até `RELAY_BATCH_SIZE` linhas não publicadas em ordem de `id` e marca `published_at` depois do ack do broker. Se o broker recusar, nada é marcado e o lote volta no próximo tick. Um crash entre publicar e marcar reenvia o lote (at-least-once); consumers deduplicam por `eventId`.
- Headers de cada mensagem: `event-id`, `event-type`, `event-version` e `traceparent` (W3C, com o `traceId` do evento).
- Linhas publicadas há mais de `RELAY_RETENTION_HOURS` são apagadas a cada `RELAY_CLEANUP_INTERVAL_MS`.
- Sobe mesmo com banco ou Kafka fora do ar: cada tick falho é logado e repetido.

| Variável | Padrão |
| --- | --- |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME` | obrigatórias (porta `5432`) |
| `RELAY_DATABASE_USER`, `RELAY_DATABASE_PASSWORD` | obrigatórias (`operantix_relay`) |
| `KAFKA_BROKERS` | obrigatória, lista `host:porta` separada por vírgula |
| `KAFKA_CLIENT_ID` | `operantix-outbox-relay` |
| `RELAY_BATCH_SIZE` | `100` (máx. 1000) |
| `RELAY_POLL_INTERVAL_MS` | `500` |
| `RELAY_DELIVERY_TIMEOUT_MS` | `10000` |
| `RELAY_RETENTION_HOURS` | `72` |
| `RELAY_CLEANUP_INTERVAL_MS` | `60000` |

## Steps

- `log`: a saída é `{message}`.
- `http_request`: uma chamada; a saída é `{status, body}` (JSON quando o `content-type` é JSON, senão texto; `truncated: true` acima de `WORKER_HTTP_MAX_RESPONSE_BYTES`). Envia `Idempotency-Key: <executionId>:<stepId>`, estável entre tentativas, para o destino descartar duplicatas. Não segue redirects (`HTTP_REDIRECT_NOT_FOLLOWED`). Mensagens de erro nunca incluem o corpo da resposta, porque qualquer papel do tenant lê os erros dos steps.
  - Com `connectionId`, o worker lê a connection no escopo do tenant da execução, abre a credencial e envia o header dela (`Authorization: Bearer ...` ou o header configurado), por cima de um header de mesmo nome no passo. A URL precisa ficar dentro do `baseUrl` da connection; senão o passo falha com `CONNECTION_URL_MISMATCH` sem fazer a chamada. Connection inexistente dá `CONNECTION_NOT_FOUND`; credencial que não abre dá `CONNECTION_UNAVAILABLE`. As três falhas são permanentes, e a credencial nunca aparece em saída, erro ou log.

Política de destino (SSRF, `@operantix/http-client`): loopback, redes privadas, link-local (inclui metadata de cloud `169.254.169.254`), CGNAT, multicast e faixas reservadas são recusados com `DESTINATION_BLOCKED`, em IPv4, IPv6 e IPv4 mapeado em IPv6. A checagem roda sobre o endereço resolvido no momento da conexão (hook de `lookup`), então um nome que passa a resolver para um IP privado (DNS rebinding) também é recusado. IPs literais são checados antes de conectar. Em produção, a política não pode ser desligada; egress controlado por rede continua recomendado (`docs/security`).

- `delay`: espera `seconds` desde o primeiro início do step sem segurar worker nem lease. Antes do prazo, o step fica `WAITING` e o job é reagendado para o fim da espera; ao acordar, o step continua na mesma tentativa e a saída é `{waitedSeconds}`.

## Dados

As tabelas são do `platform-api`. `src/engine.schema.ts` declara só as colunas que o worker usa, sem gerar migrations, e o papel `operantix_worker` só tem acesso a elas. Os testes de integração rodam contra as migrations reais do `platform-api`.

## Testes

```bash
pnpm --filter @operantix/workflow-worker test            # unit
pnpm --filter @operantix/workflow-worker test:integration # Testcontainers (Docker)
pnpm --filter @operantix/workflow-worker test:coverage    # tudo, com thresholds de 80%
```
