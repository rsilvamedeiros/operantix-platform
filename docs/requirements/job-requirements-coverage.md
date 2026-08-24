# Technical Requirements Coverage

Este documento garante que a construção do Operantix exercite as competências técnicas que motivaram parte da arquitetura, sem introduzir tecnologia sem propósito.

| Competência | Aplicação no Operantix |
|---|---|
| Node.js | APIs e workers NestJS |
| NestJS | platform-api, workflow-worker, integration-worker |
| TypeScript | frontend, backend, contracts e SDK |
| Python | AI Service com FastAPI/Pydantic |
| React / Next.js | Web Platform |
| REST | API pública/interna |
| gRPC | avaliação para comunicação interna especializada |
| PostgreSQL | source of truth transacional |
| MongoDB | payload/document storage somente quando justificado |
| Redis | cache, distributed locks, rate limiting |
| DynamoDB | fase avançada para high-volume execution events, após benchmark/ADR |
| Kafka | backbone de eventos assíncronos |
| Docker | isolamento/reprodutibilidade de workloads |
| AWS | ambiente cloud alvo |
| Terraform | IaC |
| Kubernetes | fase posterior após necessidade operacional |
| CI/CD | pipelines por path/workload |
| Distributed systems | API + consumers + AI service + data stores |
| Scalability | horizontal scaling independente |
| High availability | replicas, health checks, failover e managed services |
| Observability | OpenTelemetry + logs/metrics/traces |
| Dynatrace | backend de observabilidade possível em ambientes enterprise |
| Automated testing | unit, integration, contract, E2E, load |
| Resilience | retries, DLQ, idempotency, timeout, circuit breaker |
| Security | OAuth/OIDC/JWT, RBAC, API keys, tenant isolation |

## Regra

A tabela é um mapa de cobertura, não uma lista obrigatória para o primeiro release. Cada tecnologia entra na fase em que resolve um problema concreto.
