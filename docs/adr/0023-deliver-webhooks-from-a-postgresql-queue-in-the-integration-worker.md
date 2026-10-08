# ADR-0023 — Deliver webhooks from a PostgreSQL queue in the integration worker

**Status:** Accepted  
**Date:** 2026-10-08

## Context

O M05 entrega eventos de execução para os webhook endpoints de cada organização. Os eventos já chegam ao Kafka pelo relay da outbox (ADR-0021), e `@operantix/messaging` tem um consumer com retry topic e DLQ. Uma entrega para fora depende de um destino que a plataforma não controla: ele pode ficar lento, cair por horas ou responder erro para sempre. As escolhas são onde a chamada HTTP acontece, como os retries são agendados sem travar partições, quem tem acesso a quê no banco e o que fazer com um destino que só falha.

## Decision

- **Workload**: o app `integration-worker` (NestJS application context, sem HTTP), que o roadmap já previa. Ele não é dono de tabelas: o schema continua no `platform-api`, como no workflow worker.
- **Duas etapas**:
  1. **Fan-out**: um consumer Kafka (`opx.integration-worker.webhooks`, com `.retry` e `.dlq`) lê `opx.execution.events.v1`. Para cada evento, dentro do tenant do evento, ele cria uma linha em `webhook_deliveries` por endpoint `ACTIVE` assinante do tipo. O unique `(endpoint_id, event_id)` torna o consumo at-least-once idempotente.
  2. **Entrega**: um loop de polling faz lease das entregas vencidas com `FOR UPDATE SKIP LOCKED`, como o ADR-0018. Para cada uma, ele lê o endpoint e o secret no tenant, assina, faz o POST fora de qualquer transação e grava o resultado.
- **Retries de entrega no banco, não no Kafka**: o backoff de um destino fora do ar vai de 30 s a 1 h (`WEBHOOK_RETRY_*`, até `WEBHOOK_MAX_ATTEMPTS`), bem acima do limite de 120 s do retry topic. A fila no PostgreSQL agenda qualquer prazo sem segurar partição, e um destino lento não atrasa os outros.
- **Classificação**:
  - `2xx` é sucesso;
  - `408/425/429/5xx`, timeout e falha de conexão são retentados;
  - os outros `4xx`, redirect (nunca seguido) e destino bloqueado pela política de SSRF falham na hora.
- **Saúde do endpoint (circuit breaker)**:
  - cada tentativa falha incrementa `consecutive_failures`, e um sucesso zera;
  - ao chegar em `WEBHOOK_DISABLE_AFTER_FAILURES`, o endpoint vira `DISABLED`, a entrega que disparou isso falha e as pendentes falham com `ENDPOINT_DISABLED` sem envio;
  - reativar é uma decisão do tenant.
- **Histórico**: `webhook_delivery_attempts` é append-only, com status, código de erro e duração, nunca corpos.
- **Assinatura**: `Operantix-Signature: t=<unix>,v1=<HMAC-SHA256(secret, "<t>.<body>")>`, no estilo dos provedores conhecidos, com headers `Operantix-Event-Id`, `-Event-Type` e `-Delivery-Id`. O corpo é o envelope de contrato do evento.
- **Papel no banco**: `operantix_integration`, sem BYPASSRLS.
  - Lê só as colunas de entrega de `webhook_endpoints` e atualiza só `status` e `consecutive_failures`.
  - Lê o ciphertext de `secrets`, sem escrever.
  - Lê, insere e atualiza só colunas de estado em `webhook_deliveries`, e só insere em `webhook_delivery_attempts`.
  - A única visão cross-tenant é ler e atualizar a fila de entregas para o claim; a criação de entregas fica presa ao tenant do evento.
- **Outbound HTTP compartilhado**: o cliente e a política de destino saíram do workflow worker para `@operantix/http-client`, e os dois workers aplicam a mesma proteção contra SSRF.

## Consequences

- Um evento chega a cada endpoint at-least-once. Um crash depois do POST e antes de gravar reenvia, e o receptor deduplica por `Operantix-Event-Id`.
- Uma entrega que derruba o worker repetidamente para em `MAX_ATTEMPTS_EXCEEDED`, porque o lease conta tentativas no claim.
- O worker precisa do keyring (ADR-0022) para abrir os signing secrets.
- A ordem entre entregas não é garantida: retries e leases reordenam. O receptor usa `occurredAt`.

## Alternatives considered

- **Chamar o destino direto do consumer Kafka**: um destino lento ou fora do ar seguraria a partição, ou cairia no retry topic com no máximo 120 s de espera.
- **Um tópico por atraso (5 min, 1 h...)**: mais tópicos e consumers para o que uma coluna `next_attempt_at` resolve.
- **Fan-out e entrega no mesmo consumer, sem fila**: perderia o histórico de tentativas e o agendamento longo.

## Follow-up

- API de leitura das entregas e tentativas, e reativação de endpoints.
- Métricas de entrega (latência, taxa de falha, endpoints desativados) no M07.
- Janela de assinatura dupla na rotação do signing secret.
