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

## Como funciona

1. **Claim** (`src/queue/job-queue.ts`): um único `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)` faz lease de até `WORKER_BATCH_SIZE` jobs vencidos (`run_after <= now()`) e sem lease ativo, e incrementa `attempts`. Workers concorrentes recebem lotes disjuntos.
2. **Run** (`src/execution/execution-runner.ts`): tudo dentro de `withTenant` com a organização do job. A execução vai de `PENDING` para `RUNNING`, cada step roda em ordem e o resultado é commitado antes do próximo. Steps já `SUCCEEDED` são pulados, então um worker que morre no meio deixa um estado retomável.
3. **Complete**: quando a execução chega a um estado final, o job é apagado. Se o run lança (ex.: banco caiu), o job fica com o lease, que expira, e outro claim tenta de novo.

Regras:

- Step com falha: o step fica `FAILED` com `error.code` (`STEP_TYPE_NOT_SUPPORTED`, `STEP_ERROR`, `STEP_NOT_IN_DEFINITION`), os seguintes ficam `SKIPPED` e a execução fica `FAILED` com `{code: 'STEP_FAILED', stepId}`.
- Job com mais claims que `max_attempts` (padrão 5): a execução fica `FAILED` com `MAX_ATTEMPTS_EXCEEDED`. Isso evita que uma execução que derruba o worker seja tentada para sempre.
- Execução cancelada: o worker para antes do próximo step.
- Shutdown (`SIGTERM`/`SIGINT`): para de buscar jobs e termina o lote em andamento.

Tipos de step suportados hoje: `log`. `http_request` (com política de destino contra SSRF), `delay` e a classificação de erros para retry entram nas próximas fatias do M03.

## Dados

As tabelas são do `platform-api`. `src/engine.schema.ts` declara só as colunas que o worker usa, sem gerar migrations, e o papel `operantix_worker` só tem acesso a elas. Os testes de integração rodam contra as migrations reais do `platform-api`.

## Testes

```bash
pnpm --filter @operantix/workflow-worker test            # unit
pnpm --filter @operantix/workflow-worker test:integration # Testcontainers (Docker)
pnpm --filter @operantix/workflow-worker test:coverage    # tudo, com thresholds de 80%
```
