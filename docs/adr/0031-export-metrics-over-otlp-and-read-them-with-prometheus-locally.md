# ADR-0031 — Export metrics over OTLP and read them with Prometheus locally

**Status:** Accepted  
**Date:** 2026-10-08

## Context

O ADR-0029 deixou os traces prontos, mas o M07 também pede métricas RED (taxa, erro, duração) e um backend local. `docs/observability/metrics.md` já fixa o que medir e o que evitar: nada de usuário, tenant ou execução como label.

## Decision

- **Mesmo caminho dos traces:** `@operantix/telemetry` inicia o SDK de métricas do OpenTelemetry junto com o de tracing (`startTelemetryFromEnv`), exporta por OTLP/HTTP para o collector a cada 15 s e usa as mesmas variáveis de ambiente. Sem `OTEL_EXPORTER_OTLP_ENDPOINT` nada é iniciado e os instrumentos são no-op.
- **RED HTTP vem da instrumentação, não de código nosso:** `instrumentation-http` emite `http.server.request.duration` com método e status, sem rota nem caminho, então a cardinalidade é baixa. Requisições `/health/*` ficam de fora.
- **Métricas de domínio, poucas e com labels limitados:**
  - `operantix.execution.runs` (`outcome`): execuções rodadas pelo worker, inclusive as reagendadas.
  - `operantix.step.duration` (`step.type`, `outcome`): tipo de passo limitado a um padrão de nome; o resto vira `other`.
  - `operantix.consumer.deliveries` e `operantix.consumer.duration` (`topic`, `outcome`): o tópico vem de configuração.
- **Backend local:** no profile `observability`, o collector expõe as métricas no formato Prometheus, o Prometheus (retenção 24 h) as raspa e o Grafana carrega o dashboard `Operantix RED` por provisionamento.
- Aplicações só falam OTLP. Trocar Prometheus por Dynatrace ou outro backend OTLP é configuração do collector (`docs/observability/dynatrace.md`).

## Consequences

- Duas dependências novas, ambas do projeto OpenTelemetry: `@opentelemetry/sdk-metrics` e `@opentelemetry/exporter-metrics-otlp-http`. Mais uma imagem de desenvolvimento (Prometheus), sem papel em produção.
- O módulo que cada app importa primeiro passa de `tracing.ts` para `telemetry.ts`, já que agora inicia traces e métricas (o ADR-0029 descreve o nome anterior).
- Os nomes dos instrumentos são contrato com dashboards e alertas: renomear é mudança breaking para eles.
- Instrumentos são criados a cada medição pelo `meter()` global, que o SDK deduplica. É simples e funciona quando o provedor é trocado em testes; se virar custo, cachear por provedor.
- Alertas e SLOs não entram aqui. O dashboard cobre os sintomas definidos em `docs/observability/dashboards-alerts.md`, sem regras de alerta.

## Alternatives

- Endpoint `/metrics` Prometheus em cada processo: prende as aplicações a Prometheus e exige uma porta por workload, inclusive os workers.
- Métricas derivadas dos spans (span metrics no collector): evita instrumentos de domínio, mas mede só o que tem span e perde contagens sem trace amostrado.
- Mimir ou VictoriaMetrics no lugar do Prometheus: sem ganho para desenvolvimento local.

## Follow-up

Definir alertas e SLOs com dados reais (M08/M09). Medir lag de consumidor e saturação do pool de conexões, que ainda não são exportados.
