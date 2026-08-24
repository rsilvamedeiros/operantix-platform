# ADR-0004 — Kafka is the target event backbone

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Usar Kafka quando M04 ativar event-driven runtime.

## Consequences

Replay/fan-out/consumer groups; maior complexidade operacional.

## Alternatives considered

- RabbitMQ
- Redis Streams

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
