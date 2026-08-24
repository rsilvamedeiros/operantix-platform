# ADR-0007 — Use shared-schema multi-tenancy initially

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Shared PostgreSQL com discriminator de tenant e controles de aplicação.

## Consequences

Custo/operabilidade simples; exige testes rigorosos de isolamento.

## Alternatives considered

- Database per tenant

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
