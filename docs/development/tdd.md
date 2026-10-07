# TDD no Operantix

Decisão: [ADR-0016](../adr/0016-adopt-tdd-as-default-development-practice.md). Este documento descreve como praticar.

## Ciclo

1. **Red** — escreva um teste pequeno, de uma única razão para falhar, e rode-o. Ele deve falhar **pelo motivo certo** (asserção, não erro de import ou de setup).
2. **Green** — escreva o código mais simples que faz o teste passar. Sem generalizar além do que os testes exigem.
3. **Refactor** — com tudo verde, remova duplicação e melhore nomes e estrutura. Não adicione comportamento nesta etapa.
4. Repita em incrementos de minutos, não de horas.

## Onde começar (outside-in com ponta de lança no domínio)

1. Critério de aceite do módulo → um teste de aceitação/integração que descreve o fluxo (fica vermelho até o fim).
2. Desça para testes unitários das regras de domínio (entidades, value objects, state machines, políticas de autorização).
3. Só então implemente adapters (repositório, controller, consumer) guiados por teste de integração.

## Escolha da camada

| Comportamento | Camada | Infra |
| --- | --- | --- |
| Invariantes, state transitions, cálculo, autorização como regra | Unit | nenhuma (sem Nest app, sem banco) |
| Queries, transações, migrations, serialização, RLS/tenant filter | Integration | PostgreSQL/Redis reais em container |
| Controller + validação de DTO + mapeamento de erros HTTP | Integration (API) | app Nest + banco de teste |
| Schemas de evento/API entre workloads | Contract | schemas versionados em `packages/contracts` |
| Fluxos críticos de ponta a ponta | E2E | poucos, em ambiente controlado |

Use a camada **mais barata** que prova o comportamento.

## Regras

- Nome do teste descreve comportamento: `rejects workflow creation when user lacks membership in tenant`.
- Estrutura Arrange / Act / Assert; um conceito por teste.
- Teste comportamento observável e contratos públicos, nunca métodos privados.
- Determinístico: relógio, UUIDs e aleatoriedade injetados; sem rede real, sem chamada real a LLM.
- Mock só em fronteiras externas (provider, relógio, HTTP de terceiros). Não mocke o que você possui — prefira fakes in-memory que implementam a mesma abstração, validados por um teste de contrato compartilhado com o adapter real.
- Todo recurso tenant-bound tem teste negativo: outro tenant, sem permissão, sem autenticação (deny by default).
- Todo handler assíncrono tem teste de duplicata/retry (idempotência) e de limite de tentativas.
- Bug → primeiro um teste que o reproduz e falha; depois a correção.
- Nunca desabilitar, pular (`skip`/`xit`) ou apagar teste para obter verde.

## Evidência no PR

O PR deve permitir verificar que o teste veio primeiro: commits `test:` antes dos `feat:`/`fix:` correspondentes, ou seção "Tests" da descrição relatando o teste vermelho inicial. Squash é permitido desde que a descrição preserve essa evidência.

## Exceções

Spike descartável, boilerplate/configuração sem lógica e infraestrutura declarativa. Registre a exceção e o motivo no PR. Código de spike não é promovido sem ser reescrito com testes.

## Ferramentas

Definidas no módulo M00 e registradas aqui quando decididas (runner de testes TypeScript, Testcontainers, pytest, ferramenta de cobertura e de mutation testing). Qualquer nova dependência de teste segue `docs/development/dependencies.md`.
