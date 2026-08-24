# ADR-0001 — Use a polyglot monorepo

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Manter web, NestJS workloads, Python AI service, packages e infraestrutura no mesmo repositório, com deploy independente.

## Consequences

Simplifica mudanças coordenadas e contexto; exige boundaries e CI por path.

## Alternatives considered

- Polyrepo desde o início

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
