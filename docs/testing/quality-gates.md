# Quality Gates

Antes de merge: lint/format, typecheck, unit/integration relevantes, build, contract validation e security checks definidos. Toda mudança funcional inclui testes novos ou alterados escritos primeiro (TDD, ADR-0016); PR sem teste exige exceção justificada. Cobertura: `@vitest/coverage-v8` com piso de 80% em linhas, branches, funções e statements por app TypeScript, aplicado na CI (`.github/workflows/ci.yml`); cobertura em código novo não pode regredir. Antes de produção: migration review, smoke/E2E, observability readiness e rollback strategy.

Frontend (`apps/web`, `packages/ui`): os mesmos gates, com Vitest + Testing Library em jsdom. Componente novo tem teste de papel e nome acessível, e o axe roda sobre uma página completa (`packages/ui/src/a11y.test.tsx`); contraste de cor é verificado nos tokens, não no jsdom.
