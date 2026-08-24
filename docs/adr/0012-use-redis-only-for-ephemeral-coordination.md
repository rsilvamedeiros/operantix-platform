# ADR-0012 — Use Redis only for ephemeral coordination

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Redis para cache/locks/rate limit, nunca único source of truth crítico.

## Consequences

Falha/eviction não perde estado durável.

## Alternatives considered

- Estado de execution somente em Redis

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
