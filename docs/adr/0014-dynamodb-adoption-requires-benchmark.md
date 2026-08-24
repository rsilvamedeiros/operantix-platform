# ADR-0014 — DynamoDB adoption requires benchmark

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Avaliar DynamoDB apenas na fase avançada contra PostgreSQL para access pattern concreto.

## Consequences

Evita lock-in e checkbox architecture.

## Alternatives considered

- Usar para qualquer NoSQL

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
