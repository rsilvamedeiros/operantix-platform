# ADR-0002 — Start with modular core and distributed workers

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Manter domínio transacional coeso em platform-api e separar workers/AI por perfil operacional.

## Consequences

Evita microservice sprawl; permite extração futura baseada em evidência.

## Alternatives considered

- Microservice por domínio desde dia 1
- Monólito único com tudo no mesmo processo

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
