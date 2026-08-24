# ADR-0008 — Use pnpm workspaces and Turborepo

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Gerenciar TypeScript monorepo com pnpm + Turborepo.

## Consequences

Task graph/cache e workspace consistente.

## Alternatives considered

- npm workspaces
- Nx

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
