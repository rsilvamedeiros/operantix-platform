# ADR-0009 — Do not start with Kubernetes

**Status:** Accepted  
**Date:** 2026-08-24

## Context

Operantix precisa equilibrar arquitetura distribuída real com complexidade proporcional ao estágio do produto.

## Decision

Começar local/containers e preferir ECS/Fargate antes de EKS.

## Consequences

Reduz complexidade prematura e cria história evolutiva baseada em necessidade.

## Alternatives considered

- Kubernetes desde M00

## Follow-up

Reavaliar se métricas, escala, segurança, ownership ou operação invalidarem as premissas atuais.
