# ADR-0010 — Version event contracts explicitly

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Eventos possuem envelope e versionamento.

## Consequences

Permite evolução independente; exige disciplina e contract tests.

## Alternatives considered

- Payloads ad hoc

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
