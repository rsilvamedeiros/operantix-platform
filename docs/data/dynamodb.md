# DynamoDB

## Status

Avaliado em 2026-10-09 (ADR-0041): **não adotado**. A timeline segue em PostgreSQL; o ADR registra os gatilhos para reabrir a decisão.

## Candidate use case

High-volume execution event/timeline access com key design orientado a `executionId`, tempo e tenant.

## Evaluation criteria

- throughput e custo;
- query patterns;
- need for TTL;
- operational simplicity;
- comparison with PostgreSQL partitioning;
- impact on local development and vendor lock-in.

Adotar somente após benchmark e ADR.

## Resultado

Benchmark e desenho de chaves avaliado em `tests/benchmarks/timeline/`. O DynamoDB Local é um emulador: não use seus números como latência ou custo do serviço real.
