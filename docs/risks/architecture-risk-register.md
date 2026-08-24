# Architecture Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Microservice sprawl | alta complexidade | modular core + ADR para novo service |
| Cross-tenant data leak | crítico | TenantContext, repository constraints, negative tests |
| Retry storm | indisponibilidade downstream | bounded retry, jitter, circuit breaker, backpressure |
| Dual write DB/Kafka | evento perdido/inconsistente | transactional outbox |
| Secret leakage | security incident | secret manager, redaction, code review |
| High-cardinality telemetry | custo/instabilidade observability | metric label policy |
| AI provider lock-in | custo/migração | thin gateway + structured contracts |
| Prompt/tool injection | ação indevida/data leak | tool allowlist, validation, approval boundaries |
| Premature K8s/polyglot DB | delivery slowdown | roadmap gates/ADRs |
| Schema drift TypeScript/Python | runtime failure | interoperable contract tests |
