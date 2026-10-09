# ADR-0034 — Renew the lease of a running batch

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O ADR-0018 arrenda um lote de jobs no claim (`WORKER_LEASE_SECONDS`), mas o worker roda os jobs em sequência. Se os primeiros jobs do lote demoram, o lease dos últimos expira antes da vez deles e outro worker os reivindica: o mesmo job roda duas vezes, e um step com efeito externo (por exemplo `http_request`) repete. O mesmo vale para um único job que passe do lease. Os timeouts de HTTP e IA só garantem que um *step* cabe no lease, não o lote.

Um teste de integração mostrou o problema: com lease de 1 s e um primeiro job de 2,5 s, outro worker recebe os jobs seguintes do lote.

## Decision

- **Heartbeat:** enquanto um lote roda, o worker renova os leases dos jobs ainda não terminados a cada `WORKER_LEASE_SECONDS / 3`. Uma batida perdida não derruba o lease.
- **Posse:** `JobQueue.extend(ids)` renova só os jobs com `locked_by` igual ao worker e devolve os que ainda são dele. Comparar por `locked_by`, e não pelo prazo, recupera um lease que expirou por pouco enquanto ninguém mais o reivindicou.
- **Conferência antes de cada job:** o loop renova e verifica a posse antes de iniciar o job; se outro worker o reivindicou, o job é pulado com um aviso, e não completado.
- **Falha do heartbeat** é logada e não derruba o lote; se a falha persistir, os leases expiram e o comportamento volta ao do ADR-0018 (outro worker retoma o job, ao-menos-uma-vez).
- Sem coluna nova nem grant novo: `locked_until` já é atualizável pelo papel do worker.

## Consequences

- Execução continua **ao menos uma vez**: um worker que perde a posse no meio de um job (rede particionada por mais que o lease, processo congelado) ainda pode terminar o job que já começou. Cercar esse caso exige fencing nas escritas do runner e não entra aqui; steps com efeito externo devem ser idempotentes ou carregar chave de idempotência.
- Uma escrita extra por lote a cada terço do lease, mais uma por job.
- Os dispatchers de webhook têm a mesma forma (lote arrendado, execução sequencial), mas o receptor recebe `operantix-delivery-id` para deduplicar; ficam como estão por ora.

## Alternatives

- Arrendar um job por vez: perde o claim em lote e aumenta as idas ao banco.
- Aumentar `WORKER_LEASE_SECONDS`: só empurra o problema e atrasa a retomada após um crash.
- Fencing token em todas as escritas do runner: correto, mas é uma mudança ampla; fica como evolução.

## Follow-up

Avaliar o mesmo heartbeat no dispatcher de webhooks se os testes de carga mostrarem lotes que passam do lease.
