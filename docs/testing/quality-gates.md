# Quality Gates

Antes de merge: lint/format, typecheck, unit/integration relevantes, build, contract validation e security checks definidos. Toda mudança funcional inclui testes novos ou alterados escritos primeiro (TDD, ADR-0016); PR sem teste exige exceção justificada. O piso de cobertura e a ferramenta são definidos no M00 e registrados aqui; cobertura em código novo não pode regredir. Antes de produção: migration review, smoke/E2E, observability readiness e rollback strategy.
