# ADR-0019 — Scope the worker queue claim with a role policy

**Status:** Accepted  
**Date:** 2026-10-07

## Context

O ADR-0018 decidiu que o claim de jobs, a única leitura cross-tenant do worker, seria feito por uma função `SECURITY DEFINER`. Ao implementar, isso não funciona com o modelo do ADR-0017: as tabelas usam `FORCE ROW LEVEL SECURITY`, que aplica as policies também ao dono da tabela. Uma função `SECURITY DEFINER` roda como esse dono, e portanto continua sem ver linhas sem tenant definido. Contornar exigiria dar `BYPASSRLS` ao dono, o que vale para todo o schema, ou uma policy para o papel do dono, cujo nome muda por ambiente.

## Decision

Substitui o item 4 do ADR-0018 apenas no mecanismo do claim:

- A tabela `execution_jobs` tem a policy `tenant_isolation`, como todas, e uma policy adicional `worker_queue` restrita `TO operantix_worker` com `USING (true)`. O worker vê e atualiza a fila de todos os tenants com SQL comum (`FOR UPDATE SKIP LOCKED`).
- A fila guarda só ids, tempos e contadores, sem dados de tenant.
- O papel `operantix_worker` tem `SELECT/UPDATE/DELETE` em `execution_jobs`, `SELECT/UPDATE` em `executions` e `step_executions`, e `SELECT` em `workflow_versions`. Ele não tem `INSERT` nem acesso a outras tabelas.
- Em `executions`, `step_executions` e `workflow_versions`, o worker continua sujeito a `tenant_isolation` e lê só dentro de `withTenant` com a organização do job.

O resto do ADR-0018 continua valendo.

## Consequences

- O claim fica em SQL visível no worker, sem função no banco para manter em sincronia.
- O limite cross-tenant fica no par policy por papel e grants. Um teste de integração (`test/worker-role.int.test.ts`) prova o que o papel pode e não pode fazer.
- A migration cria o papel sem `LOGIN` quando ele não existe. Cada ambiente define `LOGIN` e senha fora das migrations.

## Alternatives considered

- **Função `SECURITY DEFINER`** (ADR-0018): bloqueada pelo `FORCE ROW LEVEL SECURITY`, como descrito no contexto.
- **Fila sem RLS**: mais simples, mas abre exceção à regra do ADR-0017 para uma tabela com `organization_id`.

## Follow-up

- Se a fila passar a guardar payload de tenant, rever esta policy.
