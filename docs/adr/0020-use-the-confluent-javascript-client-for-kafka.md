# ADR-0020 — Use the Confluent JavaScript client for Kafka

**Status:** Accepted  
**Date:** 2026-10-08

## Context

O M04 ativa o Kafka (ADR-0004) e precisa de um cliente em Node.js para produzir e, depois, consumir eventos. O cliente escolhido define garantias de entrega (idempotência, `acks`), suporte a protocolo novo do Kafka e o custo de manutenção. Também precisamos de um broker local e de testes de integração contra um broker real.

## Decision

- Usar `@confluentinc/kafka-javascript` (MIT), cliente mantido pela Confluent sobre o `librdkafka`, pela API compatível com KafkaJS (`KafkaJS.Kafka`).
- Producers são idempotentes com `acks=all` (`acks: -1`), para que retries do cliente não dupliquem nem reordenem mensagens dentro de uma partição. `message.timeout.ms` é explícito, para uma publicação falhar em tempo limitado em vez de ficar presa.
- O código da aplicação depende da abstração `EventPublisher`, não do cliente; o adapter fica em `apps/workflow-worker/src/messaging/kafka-publisher.ts`.
- Broker local e de teste: `apache/kafka:4.1.0` em KRaft, com `auto.create.topics.enable=false`. Tópicos são criados explicitamente (`infrastructure/docker/kafka/create-topics.sh`).

## Consequences

- O pacote tem binding nativo. O pnpm só roda o script de instalação dele porque está em `onlyBuiltDependencies`; o script baixa um binário pré-compilado do `librdkafka` para a plataforma. Imagens de runtime precisam de uma plataforma com binário publicado (glibc; Alpine exige build local).
- Ganhamos idempotência, compressão e as features novas do protocolo pelo `librdkafka`, que é o cliente de referência fora da JVM.
- Testes de integração sobem um Kafka real por Testcontainers (`GenericContainer`), com a porta do host escolhida antes de subir, porque o broker precisa anunciar o endereço que o cliente usa.

## Alternatives considered

- **KafkaJS**: API popular, mas sem release desde fevereiro de 2023 e sem manutenção ativa.
- **`@platformatic/kafka`**: TypeScript puro, sem binding nativo e ativo, mas mais novo e com menos histórico em produção. Reavaliar se o binding nativo virar problema de build ou deploy.
- **`node-rdkafka`**: a API de callbacks que o cliente da Confluent substitui.
- **`@testcontainers/kafka`**: o container dele falhou ao iniciar o `cp-kafka:7.9.0` em KRaft (`advertised.listeners` com `0.0.0.0`); a configuração direta da imagem oficial é mais simples e igual à do compose.

## Follow-up

- Schema Registry continua fora de escopo (non-goal do M04).
- Rever esta decisão se o binding nativo bloquear a imagem de deploy (M09).
