# ADR-0021 — Relay the outbox from a single leader process

**Status:** Accepted  
**Date:** 2026-10-08

## Context

O ADR-0011 grava eventos na tabela `outbox_events` na mesma transação da mudança de estado. Falta quem leia essas linhas e publique no Kafka (ADR-0020). As escolhas são onde esse relay roda, com que acesso ao banco, como evitar que duas instâncias publiquem fora de ordem e o que fazer com linhas já publicadas.

A regra de banco do projeto proíbe chamar serviço externo dentro de uma transação, o que exclui o padrão comum de `SELECT ... FOR UPDATE SKIP LOCKED` segurando as linhas enquanto o broker responde.

## Decision

- **Processo**: o relay é um entrypoint separado do app `workflow-worker` (`dist/relay-main.js`, `pnpm start:relay`), não um serviço novo. Ele escala e reinicia independente do worker e reaproveita o código de mensageria. Se outro producer aparecer (API, integration worker), o mesmo relay publica as linhas dele.
- **Papel no banco**: `operantix_relay`, com `SELECT` e `DELETE` em `outbox_events`, `UPDATE` só da coluna `published_at`, e a policy `outbox_relay TO operantix_relay USING (true)`. Ele não acessa nenhuma outra tabela. A visão cross-tenant é aceitável porque as linhas da outbox carregam só eventos de contrato (ids e códigos), como a fila do ADR-0019.
- **Um líder**: só publica a instância que tem o advisory lock de sessão `hashtext('operantix:outbox-relay')`. As outras ficam em standby e tentam o lock a cada tick. O lock vive na conexão, então um relay que morre libera a liderança sozinho.
- **Publicação**: o líder lê até `RELAY_BATCH_SIZE` linhas não publicadas em ordem de `id`, sem transação e sem lock de linha. Ele publica e só então marca `published_at`. Uma falha de publicação deixa o lote inteiro sem marca, para o próximo tick.
- **Garantia**: at-least-once. Um crash entre publicar e marcar reenvia o lote, e consumers deduplicam por `eventId` (`docs/events/idempotency.md`).
- **Mensagem**: valor = envelope JSON, chave = `partition_key`, headers `event-id`, `event-type`, `event-version` e `traceparent` (W3C, com o `traceId` do evento).
- **Retenção**: linhas publicadas há mais de `RELAY_RETENTION_HOURS` (padrão 72) são apagadas em lotes de 1.000, a cada `RELAY_CLEANUP_INTERVAL_MS`.

## Consequences

- Um único publisher preserva a ordem por `id`, então eventos de uma execução saem na ordem em que foram commitados pelo worker.
- O throughput fica limitado a uma instância. Isso é suficiente agora; particionar a liderança (lock por faixa de chave) é a evolução se virar gargalo.
- Uma troca de líder pode reenviar o lote em voo do líder anterior (duplicata, não perda).
- O relay sobe mesmo com banco ou Kafka fora do ar: cada tick falho é logado e repetido no intervalo.

## Alternatives considered

- **`FOR UPDATE SKIP LOCKED` com transação durante o publish**: fere a regra de não chamar serviço externo em transação e segura locks enquanto o broker responde.
- **Relay dentro do processo do worker**: menos um processo, mas acopla escala e falhas do relay ao worker, e daria ao papel do worker leitura cross-tenant da outbox.
- **Debezium/CDC**: entrega via log de replicação, sem polling, mas exige Kafka Connect e configuração de replicação lógica. Reavaliar com volume real.
- **High-water mark por `id`**: pularia linhas commitadas fora de ordem de `id` por transações concorrentes; ler `published_at IS NULL` não pula nenhuma.

## Follow-up

- Métricas de backlog (linhas não publicadas, idade da mais antiga) entram no M07.
