# Commit Conventions

Conventional Commits: `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `perf`.

## Regras

- Em inglês, modo imperativo, minúsculas, sem ponto final, até ~72 caracteres.
- **Apenas o assunto**: sem corpo/descrição. O detalhe técnico vai na descrição do PR.
- Sem trailers de autoria (`Co-Authored-By`, `Signed-off-by`, links de sessão ou menções `@`).
- Escopo opcional quando ajuda: `feat(platform-api): add health endpoints`.
- Um commit por mudança lógica; teste antes do código (`test:` antes de `feat:`/`fix:`, ver `tdd.md`).
- Breaking change: `!` após o tipo (`feat!: ...`) e explicação no PR.

## Exemplos

```text
test: add failing spec for liveness endpoint
feat: add liveness and readiness endpoints
fix: reject workflow access across tenants
docs: add TDD guide and working process
chore: configure eslint and prettier
```
