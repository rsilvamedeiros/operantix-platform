# Modular Implementation Roadmap

## M00 Foundation
Monorepo tooling, skeletons, config, local PostgreSQL/Redis, lint/test/build baseline.

## M01 Identity & Tenancy
Users, organizations, workspaces, memberships, RBAC, tenant context.

## M02 Workflow Model
Workflow aggregate, versioning, step definitions, validation, CRUD/application commands.

## M03 Execution Engine
Execution state machine e worker assíncrono inicial, ainda sem exigir Kafka se uma fila simples controlada facilitar vertical slice.

## M04 Kafka & Eventing
Kafka, contracts, outbox, consumer groups, DLQ, trace propagation.

## M05 Integrations
Connection registry, HTTP connector, webhooks, rate limiting e integration worker.

## M06 AI Service
Python service, LLM gateway, structured AI step, telemetry, pgvector/RAG depois.

## M07 Observability
OpenTelemetry end-to-end, dashboards, SLO drafts, Dynatrace compatibility.

## M08 Reliability & Scale
Idempotency hardening, circuit breakers, load tests, HA, autoscaling signals.

## M09 Cloud Deployment
Terraform + AWS ECS/RDS/Redis/secret management/CI-CD.

## M10 Advanced Platform
DynamoDB evaluation, Temporal evaluation, Kubernetes evaluation, advanced agents/analytics.

## M11 Web Foundation
Layout, design tokens, componentes acessíveis, casca do web e guia de configuração do projeto.
