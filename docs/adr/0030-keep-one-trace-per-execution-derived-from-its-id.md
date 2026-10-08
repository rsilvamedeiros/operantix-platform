# ADR-0030 — Keep one trace per execution, derived from its id

**Status:** Accepted  
**Date:** 2026-10-08

## Context

Os eventos de uma execução já carregam um `traceId` derivado do `executionId` (UUID sem hífens, 32 hex), e o relay da outbox o publica como `traceparent`. O comentário no código previa trocar isso pelo trace id do span ativo quando o OpenTelemetry chegasse. Mas uma execução não roda de uma vez: um `delay` ou um retry a estaciona e outro worker a retoma minutos depois. O span ativo de cada trecho é diferente, e guardar o contexto entre trechos exigiria uma coluna e uma migração.

## Decision

- **Todo trace de execução usa o `executionId` como trace id.** Cada trecho (`execution.run`), cada passo (`step <tipo>`), cada publicação da outbox (`<tópico> publish`, PRODUCER) e cada processamento por consumidor (`<tópico> process`, CONSUMER) entram nesse trace. Um trace mostra a execução inteira, inclusive as esperas entre trechos.
- Os spans de `execution.run` descendem de um contexto remoto sintético com esse trace id (`traceContextFor`). Não há span pai real, então a raiz aparece sem pai no backend.
- **Propagação por Kafka:** o relay abre um span PRODUCER dentro do trace do evento e escreve o contexto dele em `traceparent`. O consumidor extrai o header e abre o span CONSUMER como filho. Retries e dead letters preservam o header original, então todas as tentativas ficam no mesmo trace.
- **Sem tracing configurado**, o relay ainda escreve `traceparent` a partir do trace id do evento, para que um consumidor com tracing ligado continue o trace.
- **O trace da requisição HTTP que criou a execução não é o mesmo trace.** A criação e a execução ficam ligadas pelo `executionId` (atributo e `correlationId`), não por parentesco de spans.
- Spans de falha carregam só o código de erro, nunca a mensagem, que pode ter dados do usuário ou resposta de sistema remoto.

## Consequences

- Um trace por execução é fácil de achar (o id é conhecido) e completo mesmo com pausas. O custo: traces longos (horas, por causa de delays), que alguns backends truncam ou amostram de forma diferente; a amostragem `ParentBased` respeita o flag `sampled` do contexto sintético, que é sempre ligado.
- Sem ligação pai-filho entre a requisição de criação e a execução. Se isso fizer falta, guardar o `traceparent` da requisição na execução e usar um span link, o que exige migração e fica para um ADR próprio.
- Se um dia o `traceId` do envelope deixar de ser derivado do `executionId`, esta decisão precisa ser revista.

## Alternatives

- Trace id do span ativo em cada trecho: um trace por trecho, sem visão da execução inteira, e o `traceId` do evento deixaria de ser determinístico.
- Guardar o contexto da criação na execução e usar como pai: dá parentesco com a requisição, mas exige migração e um contexto que expira no backend antes de o delay terminar.
- Links entre traces de trechos: mais complexo de consultar do que um único trace.

## Follow-up

Medir o tamanho dos traces com delays longos ao definir amostragem e retenção (M08/M09).
