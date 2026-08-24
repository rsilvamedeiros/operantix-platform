# DynamoDB

## Status

Future evaluation, not initial implementation.

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
