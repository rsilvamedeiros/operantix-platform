# ADR-0006 — Use OpenTelemetry as observability abstraction

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Instrumentar com OpenTelemetry e exportar para backend local/enterprise.

## Consequences

Vendor neutrality e distributed tracing consistente.

## Alternatives considered

- Instrumentação direta Dynatrace-only

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
