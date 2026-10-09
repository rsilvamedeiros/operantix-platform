# Architecture Evolution Strategy

## Stage 1
Modular monorepo, PostgreSQL, Redis, API e web.

## Stage 2
Execution worker e async processing.

## Stage 3
Kafka, contracts, outbox e multiple consumers.

## Stage 4
Python AI service e integrations.

## Stage 5
Cloud HA, autoscaling, mature observability.

## Stage 6
Avaliar DynamoDB, Kubernetes, Temporal, specialized analytics stores.

Avaliado no M10 (2026-10-09), com medições e limites de reabertura nos ADRs:

| Tema | Decisão | ADR |
| --- | --- | --- |
| DynamoDB para a timeline de execução | Manter no PostgreSQL | 0041 |
| Temporal | Não adotar ainda | 0042 |
| Kubernetes | Ficar no ECS Fargate | 0043 |
| Vetores e RAG | pgvector, busca exata dentro do tenant primeiro | 0044 |
| Governança de agentes | Política versionada e guard de execução (sem runtime ainda) | 0045 |
| Analytics | PostgreSQL com índice por tenant/tempo e rollups; ClickHouse só nos limites do ADR | 0046 |

Os limites para reabrir cada decisão são propostas medidas em ambiente de teste, não dados de produção.

## Guardrail

Arquitetura futura é direção, não licença para antecipar complexidade.
