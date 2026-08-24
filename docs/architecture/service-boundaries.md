# Service Boundaries

## Platform API owns

- identity projection utilizada pela plataforma;
- organizations/workspaces/memberships;
- workflow definitions;
- API-facing execution commands/status;
- integration registrations;
- API keys e audit commands.

## Workflow Worker owns behavior

- processing lifecycle;
- step execution orchestration;
- retries e recovery;
- orchestration telemetry.

## Integration Worker owns behavior

- third-party connector execution;
- provider-specific throttling/retries;
- outbound webhook delivery.

## AI Service owns behavior

- provider abstraction;
- prompt/capability execution;
- retrieval/agent internals;
- AI-specific telemetry/evaluations.

## Rule

Se dois componentes precisam atualizar atomicamente a mesma aggregate, a separação provavelmente está errada ou prematura.
