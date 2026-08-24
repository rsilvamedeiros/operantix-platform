# Event Catalog

## Initial candidates

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
