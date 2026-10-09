# Agents

Agent é uma capability controlada com instructions, tools allowlist, budget, timeout e termination rules. Tool calls devem validar tenant/authorization no boundary responsável. Evitar agentes autônomos long-running sem durable orchestration e guardrails.

## Implemented state

`ai_service.governance` (ADR-0045) define `AgentPolicy` (allowlist de tools com aprovação humana opcional e budget de passos, tokens, custo e tempo), `RunGuard` (decide cada tool e cada passo, encerra a execução ao estourar um limite) e `AuditEvent` (sem argumentos nem conteúdo). Ainda não existe runtime de agentes nem endpoint: o guard é a camada que um runtime futuro deverá chamar.
