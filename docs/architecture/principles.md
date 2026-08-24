# Architecture Principles

1. **Business boundaries before technology boundaries.**
2. **Modular before distributed.** Extra network hops precisam de motivo.
3. **Stateless compute, explicit state.** Estado importante fica em stores definidos.
4. **Data ownership is part of architecture.** Não compartilhar tabelas informalmente.
5. **At-least-once + idempotency.** Não prometer exactly-once sem prova.
6. **Observability by design.** Trace context cruza HTTP e mensagens.
7. **Security by default.** Authorization e tenant isolation não são features tardias.
8. **Contracts evolve explicitly.** Versionar APIs e eventos.
9. **Measure before optimize.** Escala e performance baseadas em métricas.
10. **Managed complexity.** Kafka/K8s/Dynamo/Temporal entram por necessidade.
11. **Reversible decisions first.** Evitar lock-in desnecessário.
12. **Vertical slices.** Cada módulo entrega valor executável e testável.
