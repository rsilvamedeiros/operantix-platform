# ADR-0029 — Trace with the OpenTelemetry Node SDK and a local Tempo stack

**Status:** Accepted  
**Date:** 2026-10-08

## Context

ADR-0006 escolheu OpenTelemetry como abstração de observabilidade, mas nada em código a usa ainda. O M07 pede tracing distribuído, logs correlacionados e um backend local. Os workloads TypeScript precisam de um bootstrap único, sem acoplar a aplicação a um vendor, e o desenvolvedor precisa ver um trace sem criar conta em nada.

## Decision

- **SDK mínimo, sem o meta-pacote `auto-instrumentations-node`.** `@operantix/telemetry` usa `@opentelemetry/sdk-trace-node`, o exportador OTLP/HTTP e só duas instrumentações: `instrumentation-http` (entrada e saída, ignorando `/health/*`) e `instrumentation-pg`. O meta-pacote traz dezenas de instrumentações que não usamos e aumenta a superfície de atualização. Novas instrumentações entram quando um módulo as pedir (Kafka no próximo slice).
- **Tracing é opt-in por ambiente.** Sem `OTEL_EXPORTER_OTLP_ENDPOINT` nada é iniciado e a API do OpenTelemetry fica no-op. Variáveis lidas: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_TRACES_SAMPLER_ARG` (razão 0..1, padrão 1). A amostragem é `ParentBased(TraceIdRatio)`: a decisão de um pai remoto é respeitada. Erros de configuração citam só o nome da variável.
- **Um módulo `tracing.ts` por app, importado antes de qualquer outro**, chama `startTracingFromEnv`, para que `http` e `pg` sejam instrumentados quando carregam. SIGTERM/SIGINT fazem flush dos spans pendentes.
- **Logs ganham `traceId` e `spanId`** do span ativo, ao lado do `correlationId` do slice anterior.
- **Backend local:** profile `observability` do Compose com OpenTelemetry Collector (contrib), Grafana Tempo e Grafana, provisionado com Tempo como datasource. A aplicação só fala OTLP com o collector; trocar Tempo por Dynatrace ou outro backend OTLP é configuração do collector, não código.
- Imagens do stack local ficam fixadas em tags exatas e só servem desenvolvimento: retenção de 24 h, disco local, Grafana anônimo em `127.0.0.1`.

## Consequences

- Nove pacotes novos de OpenTelemetry em `packages/telemetry` (api, sdk-trace-node, sdk-trace-base, resources, exporter-trace-otlp-http, instrumentation, instrumentation-http, instrumentation-pg, semantic-conventions). Todos são do projeto OpenTelemetry e as versões ficam no lockfile.
- A propagação por Kafka (outbox → consumidores) e as métricas RED não fazem parte deste ADR; entram nos próximos slices do M07.
- O ai-service em Python segue sem tracing até um slice próprio.
- Produção continua sem backend definido: o stack local não é desenho de produção.

## Alternatives

- `@opentelemetry/sdk-node` com `auto-instrumentations-node`: menos código, mais dependências e instrumentações implícitas.
- Exportar direto para o backend sem collector: acopla a aplicação ao endpoint e perde buffering e processadores.
- Jaeger no lugar do Tempo: serve para traces, mas Tempo + Grafana também cobrirá métricas e logs depois.

## Follow-up

Reavaliar a troca para `sdk-node` se o número de instrumentações crescer. Revisar amostragem e retenção ao definir ambientes reais (M09).
