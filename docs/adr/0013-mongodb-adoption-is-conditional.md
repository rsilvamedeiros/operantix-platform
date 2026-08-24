# ADR-0013 — MongoDB adoption is conditional

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Não adicionar MongoDB antes de um caso de documento/payload justificar.

## Consequences

Evita polyglot persistence artificial.

## Alternatives considered

- Adicionar no foundation

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
