# Domain Map

- **Identity & Access** — Autenticação, identidade do usuário, memberships, roles, API keys e policy evaluation.
- **Organizations & Workspaces** — Estrutura multi-tenant, ownership, configuração e boundaries operacionais.
- **Workflows** — Definição, versionamento, activation e estrutura de automações.
- **Executions** — Lifecycle de uma execução e de cada step, tentativas, status, outputs e erros.
- **Integrations** — Connections e connector definitions sem vazar detalhes de provider no core.
- **AI** — Capabilities de IA, agents, knowledge sources, prompts e model policies.
- **Notifications** — Solicitações e entregas de notificações/eventos outbound.
- **Billing & Entitlements** — Planos, limites e direitos de uso; fase posterior.
- **Audit & Compliance** — Registro imutável de ações sensíveis e mudanças administrativas.
- **Operational Observability** — Visão de produto sobre execution timeline, incident context e health operacional.

## Relationships

Workflows pertencem a Workspaces. Executions referenciam uma WorkflowVersion imutável. Integrations são registradas no Workspace e referenciadas por steps. AI capabilities podem ser chamadas por steps sem permitir que o domínio Workflow dependa de SDK de provider. Audit observa ações administrativas e mutações relevantes.

## Boundary rule

Um domain module expõe comandos/queries/eventos explícitos; outros módulos não devem alcançar seus repositories internos.
