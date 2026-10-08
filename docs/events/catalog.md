# Event Catalog

## Implemented contracts

Definidos em `packages/contracts/src/events/execution-events.ts`, com JSON Schema em `packages/contracts/schemas/events/`. Todos usam `executionId` como partition key.

| Evento | Versão | `data` | Valor |
| --- | --- | --- | --- |
| `execution.started` | 1 | `executionId`, `workflowId`, `workflowVersion` | stream do ciclo de vida |
| `execution.step.started` | 1 | `executionId`, `stepId`, `attempt` | progresso por step |
| `execution.step.completed` | 1 | `executionId`, `stepId`, `attempt` | progresso por step |
| `execution.step.failed` | 1 | `executionId`, `stepId`, `attempt`, `errorCode`, `retryable` | alertas e métricas de falha |
| `execution.completed` | 1 | `executionId`, `workflowId` | notificação de término (integrações, M05) |
| `execution.failed` | 1 | `executionId`, `errorCode` | notificação de falha (integrações, M05) |

Mensagens de erro ficam fora dos eventos: podem citar destinos HTTP. Producer: o workflow worker, via outbox (`docs/events/outbox.md`), no topic `opx.execution.events.v1`. A publicação no Kafka entra na próxima entrega do M04.

## Candidates

### Workflow
- `workflow.created`
- `workflow.version.published`
- `workflow.activated`
- `workflow.deactivated`

### Execution
- `execution.start.requested`
- `execution.started`
- `execution.step.started`
- `execution.step.completed`
- `execution.step.failed`
- `execution.completed`
- `execution.failed`

### Integration
- `integration.connected`
- `integration.sync.requested`
- `integration.sync.completed`
- `integration.sync.failed`

### AI
- `ai.execution.requested`
- `ai.execution.completed`
- `ai.execution.failed`

Cada evento só é criado quando existir consumer/caso real ou valor de audit/stream claro.
