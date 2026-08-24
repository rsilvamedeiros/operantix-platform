# Canonical Use Cases

## UC-01 — Lead enrichment
Webhook recebe um lead, Integration Worker consulta CRM, AI Service classifica intenção, Workflow decide rota e publica notificação.

## UC-02 — Support triage
Ticket novo é enriquecido com contexto, classificado por IA, prioridade calculada e incidente crítico encaminhado.

## UC-03 — Document intake
Arquivo é recebido, texto processado, campos estruturados por IA, validações aplicadas e resultado enviado a sistema externo.

## UC-04 — Operational reconciliation
Job programado consulta fontes externas, compara estados, registra divergências e abre tarefas de correção.

## UC-05 — Developer-triggered automation
Sistema cliente chama API com API key e idempotency key, inicia workflow e consulta status/resultado.

Esses casos devem orientar decisões de arquitetura e testes E2E.
