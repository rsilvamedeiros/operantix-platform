# Branching

Preferência por trunk/mainline com feature branches curtas, saindo e voltando para `main`. Não criar branches long-lived por ambiente se CI/CD puder promover artifacts.

## Nomes

- Formato `<tipo>/<resumo-curto-em-kebab-case>`, com os mesmos tipos dos commits: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/`, `ci/`.
- Em inglês, descrevendo a mudança. Exemplos: `feat/health-endpoints`, `docs/adopt-tdd`, `chore/eslint-prettier`.
- Sem nome de ferramenta, agente ou autor no nome da branch (nada de `claude/...`, `ai/...`, `bot/...`).
- Uma branch por mudança coesa; apagar após o merge.
