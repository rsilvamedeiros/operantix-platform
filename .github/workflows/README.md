# CI/CD

| Workflow | Quando roda | O que faz |
| --- | --- | --- |
| `ci.yml` | Todo PR e push na `main` | Format, lint, typecheck, build e testes (unit + integração com Testcontainers) com piso de cobertura. |
| `pr-conventions.yml` | Todo PR | Valida o título do PR (Conventional Commits) e o nome da branch (`docs/development/branching.md`). |
| `code-review.yml` | PR aberto, atualizado ou marcado como pronto (não roda em draft) | Revisão automática do diff com Claude Code, com comentários inline e um resumo no PR. |

Os gates evoluem por workload/path conforme novos apps entram no workspace.

## Segredos

- `CLAUDE_CODE_OAUTH_TOKEN`: token do Claude Code usado pela revisão automática. Gerado com `claude setup-token` e cadastrado em Settings → Secrets and variables → Actions. Requer o Claude GitHub App instalado no repositório. Sem o secret, o job passa com um aviso e não revisa.
