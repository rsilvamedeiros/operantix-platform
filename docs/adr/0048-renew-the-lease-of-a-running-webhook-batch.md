# ADR-0048 — Renew the lease of a running webhook batch

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O ADR-0034 renovou o lease do lote de jobs do workflow worker e deixou o dispatcher de webhooks "como está", avaliando-o depois. O dispatcher tem a mesma forma: `claim()` arrenda o lote inteiro (`WEBHOOK_LEASE_SECONDS`) e as entregas saem uma a uma. Se as primeiras demoram (um destino lento, até o timeout de HTTP), o lease das últimas expira antes da vez delas e outro dispatcher as reivindica: o mesmo evento é enviado duas vezes. O receptor pode deduplicar por `operantix-delivery-id`, mas nem todo receptor o faz.

Um teste de integração reproduziu o problema: com lease de 1 s e a primeira requisição presa por 2,5 s, um segundo dispatcher reivindicou as três entregas e cada destino recebeu duas requisições.

## Decision

- Enquanto um lote roda, o dispatcher renova o lease das entregas ainda não terminadas (inclusive a que está em voo) a cada `WEBHOOK_LEASE_SECONDS / 3`. Uma batida perdida não derruba o lease.
- **Posse sem coluna nova:** `webhook_deliveries` não tem `locked_by`, mas cada claim incrementa `attempts`. O dispatcher renova só as linhas `PENDING` cujo `attempts` ainda é o que ele recebeu; se outro dispatcher reivindicou, o contador mudou e a entrega deixa de ser dele. Isso também recupera um lease que venceu por pouco sem que ninguém mais reivindicasse.
- **Conferência antes de cada entrega:** o dispatcher renova e verifica a posse antes de enviar; uma entrega que outro assumiu é pulada com aviso.
- Falha do heartbeat é logada e não derruba o lote; se persistir, os leases vencem e vale o comportamento do ADR-0023 (outro dispatcher retoma, ao-menos-uma-vez).
- A cadência é derivada do lease (`leaseHeartbeatMs` opcional só para testes); nenhuma variável de ambiente nova, nenhuma migração, nenhum grant.

## Consequences

- Continua **ao menos uma vez**: a requisição que já saiu quando outro dispatcher assume (processo congelado, partição de rede maior que o lease) pode ser repetida. O teste prova que só ela se repete, e não as ainda não iniciadas.
- Uma escrita extra por lote a cada terço do lease e uma por entrega, em uma única instrução.
- A conferência olha o lease, não o `locked_by`; uma entrega reivindicada, adiada e reivindicada de novo por outro dispatcher com o mesmo `attempts` seria indistinguível. `defer` decrementa `attempts`, mas só depois de a entrega sair do lote, então a janela não existe enquanto o lote é seu.
- O limite `WEBHOOK_HTTP_TIMEOUT_MS < WEBHOOK_LEASE_SECONDS` (config) continua válido e agora é uma segunda defesa.

## Alternatives

- **Adicionar `locked_by`:** posse explícita, mas exige migração e grants para um problema que o contador de claims já resolve.
- **Arrendar uma entrega por vez:** perde o claim em lote e multiplica as idas ao banco.
- **Aumentar o lease:** só empurra o problema e atrasa a retomada depois de um crash.

## Follow-up

- Fencing nas escritas de resultado se algum dia a repetição da requisição em voo for inaceitável.
