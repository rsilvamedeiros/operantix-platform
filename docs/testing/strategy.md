# Testing Strategy

**Prática padrão: TDD** ([ADR-0016](../adr/0016-adopt-tdd-as-default-development-practice.md), [guia](../development/tdd.md)). O teste é escrito antes do código; o ciclo é red → green → refactor.

Pirâmide pragmática: muitas unit tests para regras, integration tests reais para adapters, contract tests entre boundaries, poucos E2E críticos e load tests direcionados. Mockar provider externo na maioria dos testes; manter smoke contract em ambiente controlado quando necessário.

## Princípios

- Teste comportamento e contratos, não implementação.
- Camada mais barata que prove o comportamento.
- Testes determinísticos; sem rede real nem LLM real na CI padrão.
- Casos negativos de autorização e tenant isolation são obrigatórios em features tenant-bound.
- Cobertura é sinal, não meta.
