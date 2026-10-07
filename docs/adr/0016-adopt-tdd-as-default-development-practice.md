# ADR-0016 — Adopt TDD as the default development practice

**Status:** Accepted  
**Date:** 2026-10-07

## Context

Operantix é uma plataforma com regras de negócio sensíveis (multi-tenancy, autorização, state machines de execução, idempotência, contratos de eventos). Esses pontos são caros de corrigir depois de em produção e fáceis de regredir silenciosamente. O código será escrito em grande parte com apoio de agentes de IA, o que torna testes executáveis a principal forma de especificar e verificar comportamento.

## Decision

Adotar **TDD (Test-Driven Development)** como prática padrão de desenvolvimento em todo o monorepo:

1. **Red**: escrever primeiro um teste que falha e que descreve o comportamento esperado.
2. **Green**: implementar o mínimo para o teste passar.
3. **Refactor**: melhorar o design com a suíte verde.

TDD é uma prática de processo, não uma mudança de topologia: não altera os ADRs 0001–0015. O monorepo, o core modular NestJS e os limites de domínio continuam como decididos. Detalhes operacionais em `docs/development/tdd.md`.

Escopo e exceções:

- Obrigatório para regra de negócio, autorização, tenant isolation, state machines, validação de boundary, idempotência/retry e contratos.
- Para adapters (banco, Redis, Kafka), o teste de integração é escrito antes ou junto da implementação, contra infraestrutura real em container.
- Exceções permitidas e registradas no PR: spikes descartáveis, configuração/boilerplate sem lógica, ajustes de infraestrutura declarativa. Um spike que virar código de produção deve ser reescrito com testes primeiro.
- Um bug corrigido começa com um teste que o reproduz.

## Consequences

- Toda mudança funcional deve mostrar o teste antes do código (commits ou descrição do PR).
- Maior esforço inicial por feature, em troca de menos regressão e design mais testável (domínio fora de controllers, dependências por abstração).
- Quality gates passam a exigir testes novos ou alterados junto de qualquer mudança funcional e um piso de cobertura definido em `docs/testing/quality-gates.md`.
- Cobertura é sinal, não meta: o critério é o comportamento testado, não a porcentagem.

## Alternatives considered

- Test-after (testes escritos depois do código): menor atrito, mas leva a testes acoplados à implementação e cobertura de caminhos de erro mais fraca.
- TDD apenas no domínio: deixa fora autorização, contratos e adapters, onde estão os maiores riscos desta plataforma.

## Follow-up

Reavaliar após o M01 (Identity & Tenancy) com base em tempo de ciclo, taxa de regressão e flakiness da suíte.
