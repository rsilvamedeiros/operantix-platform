# Transactional Outbox

## Problem

Salvar estado em PostgreSQL e publicar Kafka em operações independentes cria dual-write inconsistency.

## Direction

Quando eventos de domínio críticos forem publicados, a mesma transação grava state + outbox record. Um publisher entrega outbox ao Kafka e marca progresso de maneira idempotente.

## Guarantees

Outbox não cria exactly-once. Ele reduz perda entre commit e publish; consumers continuam idempotentes.
