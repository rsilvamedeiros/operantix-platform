# ADR-0005 — Python owns specialized AI workloads

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Executar AI Service em Python/FastAPI.

## Consequences

Aproveita ecossistema AI e cria boundary claro; exige contracts cross-language.

## Alternatives considered

- Tudo em Node.js

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
