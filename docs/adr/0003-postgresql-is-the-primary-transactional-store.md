# ADR-0003 — PostgreSQL is the primary transactional store

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Usar PostgreSQL como source of truth inicial.

## Consequences

Consistência, SQL e maturidade; outros stores entram por access pattern.

## Alternatives considered

- MongoDB como primary

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
