# Deployment View

## Local

Host: web/API/workers com hot reload. Containers: PostgreSQL/Redis; eventing/observability entram por fase.

## AWS target

```mermaid
flowchart LR
  U[Users] --> E[CDN/WAF/ALB]
  E --> WEB[Web Tasks]
  E --> API[Platform API Tasks]
  API --> RDS[(RDS PostgreSQL)]
  API --> REDIS[(Managed Redis)]
  API --> K[Managed/Self-managed Kafka target]
  K --> WW[Workflow Worker Tasks]
  K --> IW[Integration Worker Tasks]
  WW --> AI[AI Service Tasks]
  IW --> EXT[External Providers]
  AI --> LLM[LLM Providers]
  API -. OTLP .-> OBS[Observability Backend]
  WW -. OTLP .-> OBS
  IW -. OTLP .-> OBS
  AI -. OTLP .-> OBS
```

ECS/Fargate é direção inicial; EKS só após ADR posterior.
