# ADR-0045 — Govern agent runs with a versioned policy and a run guard

**Status:** Accepted  
**Date:** 2026-10-09

## Context

`docs/ai/agents.md` e `docs/ai/guardrails.md` exigem allowlist de tools, budget, timeout, regras de término e aprovação humana para ações de alto impacto, mas hoje isso é só texto. Ainda não existe runtime de agentes. A pergunta do M10 é como governar agentes antes de existirem, sem escolher framework de agentes nem orquestrador durável (ADR-0042 adia o Temporal).

## Decision

Em `services/ai-service/src/ai_service/governance`, uma camada **pura** (sem I/O, sem LLM, sem dados de tenant) com três peças:

- **`AgentPolicy`** (Pydantic, imutável, campos extras proibidos): `agent_id`, `version`, `tools` (allowlist; cada `ToolRule` pode exigir aprovação humana) e `Budget` (`max_steps`, `max_tokens`, `max_cost_usd`, `max_seconds`, todos > 0). A versão entra em todo evento de auditoria.
- **`RunGuard`**: uma instância por execução. `authorize_tool(nome, approved=)` e `record_step(tokens, cost_usd)` respondem se o agente pode seguir. Regras: **deny by default** (tool fora da allowlist é negada, mesmo com aprovação); tool de alto impacto só passa com `approved=True`; estourar passos, tokens, custo ou prazo **encerra a execução** e tudo depois é negado (`RUN_TERMINATED`); uma tool negada **não** encerra, para o agente poder escolher outra; gastar exatamente o limite é permitido; uso negativo é erro, não reembolso.
- **`AuditEvent`**: cada decisão gera um evento com agente, versão da política, `run_id`, organização, `trace_id`, hora, nome da tool e motivo. **Nunca** argumentos, resultados nem texto de prompt/resposta (regra do `CLAUDE.md`).

O relógio é injetável, então os testes são determinísticos.

## Consequences

- Qualquer runtime futuro (loop próprio, SDK de agentes, Temporal) chama o guard em vez de reimplementar limites; a política é o contrato testável.
- O guard decide, mas **não** obtém a aprovação humana, **não** valida tenant/autorização da tool (continua no boundary dono da tool) e **não** publica os eventos: isso é do runtime.
- O estado do guard vive na memória do processo. Retomar uma execução depois de reinício exige persistir os contadores, o que é decisão do runtime durável, não desta camada.
- Nenhum endpoint, dependência nova ou mudança de contrato. Falta ligar o `AuditEvent` ao envelope de eventos versionado quando houver um consumidor.

## Alternatives

- **Escolher já um framework de agentes:** acopla a decisão de governança a um runtime que ainda não é necessário.
- **Limites só nos prompts:** não são verificáveis nem auditáveis.
- **Aplicar os limites no gateway de LLM:** o gateway não conhece passos nem tools; budget por execução é conceito do agente.

## Follow-up

- Persistir contadores e decisões quando houver orquestração durável.
- Fluxo de aprovação humana (quem aprova, expiração) quando existir a primeira tool de alto impacto.
- Publicar `AuditEvent` como evento versionado (`eventType`, `eventVersion`, contexto de tenant).
