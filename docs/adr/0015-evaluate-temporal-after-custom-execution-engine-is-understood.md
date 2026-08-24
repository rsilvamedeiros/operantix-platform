# ADR-0015 — Evaluate Temporal after custom execution engine is understood

**Status:** Proposed  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Fazer spike de Temporal quando durable long-running workflows virarem gargalo de complexidade.

## Consequences

Pode reduzir código de orchestration; adiciona plataforma/runtime e novo mental model.

## Alternatives considered

- Continuar engine próprio
- Adotar Temporal imediatamente

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
