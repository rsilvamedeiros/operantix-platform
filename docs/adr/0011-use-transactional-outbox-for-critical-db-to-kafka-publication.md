# ADR-0011 — Use transactional outbox for critical DB-to-Kafka publication

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Quando M04 existir, mutação transacional e outbox entram na mesma transação.

## Consequences

Reduz dual-write loss; adiciona publisher/cleanup.

## Alternatives considered

- Dual write direto

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
