# Testing Strategy

Pirâmide pragmática: muitas unit tests para regras, integration tests reais para adapters, contract tests entre boundaries, poucos E2E críticos e load tests direcionados. Mockar provider externo na maioria dos testes; manter smoke contract em ambiente controlado quando necessário.
