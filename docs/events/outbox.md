# Transactional Outbox

## Problem

Salvar estado em PostgreSQL e publicar Kafka em operações independentes cria dual-write inconsistency.

## Direction

Quando eventos de domínio críticos forem publicados, a mesma transação grava state + outbox record. Um publisher entrega outbox ao Kafka e marca progresso de maneira idempotente.

## Guarantees

Outbox não cria exactly-once. Ele reduz perda entre commit e publish; consumers continuam idempotentes.

## Implemented state

- Tabela `outbox_events` (dona: `platform-api`, `src/eventing/outbox.schema.ts`): `event_id` único, `topic`, `partition_key`, `event_type`, `payload` (o envelope completo, validado por `@operantix/contracts` antes de gravar), `created_at` e `published_at`. Um índice parcial cobre as linhas ainda não publicadas, em ordem de `id`.
- RLS por tenant para quem escreve; `operantix_worker` só tem `INSERT` e não lê de volta.
- Producer atual: o workflow worker, que grava os eventos do ciclo de vida da execução na mesma transação da mudança de estado.
- Relay (ADR-0021): processo `pnpm --filter @operantix/workflow-worker start:relay`, papel `operantix_relay`, uma instância líder por advisory lock. Publica em ordem de `id`, marca `published_at` depois do ack do broker e apaga linhas publicadas há mais de `RELAY_RETENTION_HOURS`. Entrega at-least-once.
