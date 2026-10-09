# ADR-0032 — Open a circuit per failing webhook endpoint

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O ADR-0023 desativa um endpoint após `WEBHOOK_DISABLE_AFTER_FAILURES` falhas seguidas (20), mas até lá cada entrega pendente continua tentando, gastando tentativas e ocupando o lote do dispatcher com um destino que está fora do ar. Um destino lento ou caído atrasa os outros porque os lotes são compartilhados entre tenants. O M05 deixou isso adiado para o M08.

## Decision

- **Estado no próprio endpoint:** nova coluna `webhook_endpoints.circuit_open_until` (nula = fechado). O contador `consecutive_failures` já existente é a contagem de falhas.
- **Política pura** (`circuit-breaker.ts`): abaixo de `WEBHOOK_CIRCUIT_FAILURE_THRESHOLD` (5) envia; com `circuit_open_until` no futuro adia; passado o prazo, uma entrega faz a sonda (half-open).
- **Abrir:** a cada falha em ou acima do limiar, `circuit_open_until = agora + cooldown`, com `cooldown = WEBHOOK_CIRCUIT_COOLDOWN_MS (30 s) * 2^(falhas - limiar)`, limitado por `WEBHOOK_CIRCUIT_MAX_COOLDOWN_MS` (15 min). Sonda que falha reabre com o dobro do tempo.
- **Sonda única:** o dispatcher faz compare-and-set em `circuit_open_until`, reabrindo por um cooldown base. Só quem vence envia; as outras entregas do endpoint são adiadas. Se a sonda travar, o circuito fecha sozinho pelo prazo. Sucesso zera falhas e limpa o circuito.
- **Adiar não gasta tentativa:** a entrega volta a `PENDING` com `next_attempt_at = circuit_open_until`, lease liberado, `attempts` devolvido e nenhuma linha em `webhook_delivery_attempts`.
- **Desativação continua:** o limiar do circuito precisa ser menor que `WEBHOOK_DISABLE_AFTER_FAILURES` (validado na configuração).
- **Permissões:** o papel `operantix_integration` ganha `SELECT` e `UPDATE` só na coluna nova. RLS inalterada: todas as leituras e escritas do circuito ocorrem na transação do tenant.

## Consequences

- Um destino fora do ar deixa de consumir tentativas e de ser martelado; o custo é uma escrita extra por falha no endpoint.
- Entregas adiadas esperam até o fim do cooldown (no máximo 15 min), mesmo que o destino volte antes. Isso é o preço de sondar com uma única entrega.
- Migração `0029` é aditiva e reversível (remover a coluna e os grants).
- Sem métrica própria ainda; o estado do circuito é visível pelo banco. Métricas de saturação entram no slice de sinais de autoscaling.

## Alternatives

- Estado em memória por réplica: cada réplica sondaria sozinha e o estado se perderia no restart.
- Redis como estado: Redis não é source of truth (arquitetura) e adicionaria dependência ao worker.
- Só reduzir o limiar de desativação: perde o caminho de recuperação automática.

## Follow-up

Métrica de endpoints com circuito aberto (slice de autoscaling do M08).
