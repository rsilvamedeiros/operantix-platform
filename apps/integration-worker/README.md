# Integration Worker

Worker NestJS para integrações externas (M05). Não expõe HTTP: consome eventos de execução do Kafka e entrega webhooks (ADR-0023).

## Rodar localmente

```bash
docker compose up -d postgres kafka kafka-init
pnpm --filter @operantix/platform-api db:migrate   # o schema é do platform-api
pnpm --filter @operantix/integration-worker build
pnpm --filter @operantix/integration-worker start
```

## Como funciona

1. **Fan-out**: o consumer (`@operantix/messaging`, group `WEBHOOK_CONSUMER_GROUP`) lê `opx.execution.events.v1`. Para cada evento, no tenant do evento, ele cria uma entrega em `webhook_deliveries` por endpoint `ACTIVE` que assina o tipo. `(endpoint_id, event_id)` é único, então reconsumir não duplica. Falhas aqui (banco fora) vão para `<group>.retry` e, esgotadas, para `<group>.dlq`.
2. **Entrega**: a cada tick, um único `UPDATE ... FOR UPDATE SKIP LOCKED` faz lease de até `WEBHOOK_BATCH_SIZE` entregas vencidas de qualquer tenant e conta a tentativa. Para cada entrega:
   - lê o endpoint e abre o signing secret no tenant da entrega (keyring de `SECRETS_ENCRYPTION_KEYS`);
   - faz o POST assinado fora de transação, com `@operantix/http-client` (política de SSRF, timeout, sem redirects);
   - grava a tentativa, o próximo estado da entrega e a saúde do endpoint numa transação.
3. **Resultado**:
   - `2xx`: `SUCCEEDED`, e o endpoint volta a `consecutive_failures = 0`.
   - Falha retentável: volta a `PENDING` com `next_attempt_at` em backoff exponencial.
   - Falha permanente, ou sem tentativas restantes: `FAILED`.
   - `WEBHOOK_DISABLE_AFTER_FAILURES` falhas seguidas desativam o endpoint, e as entregas pendentes dele falham com `ENDPOINT_DISABLED` sem envio.
4. **Crash**: a entrega fica com o lease, que expira, e outro claim tenta de novo. Mais claims que `WEBHOOK_MAX_ATTEMPTS` encerram a entrega com `MAX_ATTEMPTS_EXCEEDED`.

Logs de cada tentativa trazem ids, status e código de erro. Nunca trazem o corpo, a URL completa ou o secret. Formato, assinatura e verificação ficam em `docs/api/webhooks.md`.

## Configuração

Validada na inicialização (`src/config.ts`). Uma variável inválida derruba o processo com o nome da variável, nunca o valor.

| Variável | Padrão |
| --- | --- |
| `NODE_ENV` | `development` |
| `DATABASE_HOST`, `DATABASE_NAME` | obrigatórias (as mesmas do `platform-api`) |
| `DATABASE_PORT` | `5432` |
| `INTEGRATION_DATABASE_USER`, `INTEGRATION_DATABASE_PASSWORD` | obrigatórias; papel `operantix_integration` |
| `KAFKA_BROKERS` | obrigatória, lista `host:porta` separada por vírgula |
| `KAFKA_CLIENT_ID` | `operantix-integration-worker` |
| `WEBHOOK_CONSUMER_GROUP` | `opx.integration-worker.webhooks` (tópicos `.retry` e `.dlq`) |
| `WEBHOOK_BATCH_SIZE` | `10` (máx. 100) |
| `WEBHOOK_POLL_INTERVAL_MS` | `1000` |
| `WEBHOOK_LEASE_SECONDS` | `60` |
| `WEBHOOK_MAX_ATTEMPTS` | `8` (máx. 20) |
| `WEBHOOK_RETRY_BASE_DELAY_MS`, `WEBHOOK_RETRY_MAX_DELAY_MS` | `30000`, `3600000` |
| `WEBHOOK_DISABLE_AFTER_FAILURES` | `20` |
| `WEBHOOK_HTTP_TIMEOUT_MS` | `10000`; precisa ser menor que o lease |
| `WEBHOOK_HTTP_ALLOW_PRIVATE_NETWORKS` | `false`; `true` é recusado com `NODE_ENV=production` |
| `WEBHOOK_HTTP_MAX_RESPONSE_BYTES` | `4096` (máx. 64 KiB; o corpo é descartado) |
| `SECRETS_ENCRYPTION_KEYS` | obrigatória, o mesmo keyring do `platform-api` (ADR-0022) |

## Dados

As tabelas são do `platform-api`. `src/integration.schema.ts` declara só as colunas que o worker usa, e o papel `operantix_integration` só tem acesso a elas (migration `0022`). Os testes de integração rodam contra as migrations reais.

## Testes

```bash
pnpm --filter @operantix/integration-worker test            # unit
pnpm --filter @operantix/integration-worker test:integration # PostgreSQL e Kafka (Testcontainers)
pnpm --filter @operantix/integration-worker test:coverage    # tudo, com thresholds de 80%
```
