# Processo de trabalho

Visão ponta a ponta de como uma mudança sai da ideia e chega ao `main`. Complementa `docs/workflow/module-protocol.md`, `docs/development/tdd.md` e os checklists.

## 1. Preparar (Definition of Ready)

- Módulo ativo e ADRs relacionados identificados (`docs/workflow/`, `docs/adr/`).
- Escopo e non-goals confirmados no documento do módulo.
- Critérios de aceite escritos como comportamentos testáveis.
- Riscos de segurança/tenancy reconhecidos.
- Mudança estrutural ou stop condition (ver `module-protocol.md`) → **ADR primeiro**.

## 2. Planejar

Plano curto (`/plan-module`): arquivos afetados, contratos, camadas de teste, riscos. Mudanças de contrato ou de dados são desenhadas antes de controllers/UI.

## 3. Implementar com TDD

Branch curta a partir de `main` (`feat/…`, `fix/…`, `docs/…`, `chore/…`). Ciclo red → green → refactor, em incrementos verticais pequenos. Commits em Conventional Commits; teste antes do código. Detalhes em `tdd.md`.

## 4. Verificar localmente

Rodar os quality gates (`docs/testing/quality-gates.md`): format/lint, typecheck, testes relevantes, build e checagem de contratos. Revisar o próprio diff (`/review-changes`); usar `/security-review` e `/architecture-review` quando tocar auth, tenancy, dados ou fronteiras.

## 5. Pull Request

- Pequeno e coeso; usa `.github/PULL_REQUEST_TEMPLATE.md`.
- Descreve problema, solução, testes (incluindo evidência de TDD), contratos, migrations, observabilidade, segurança e rollback.
- CI verde é pré-condição para revisão e merge.

## 6. Revisão

- Pelo menos uma aprovação antes do merge em `main`.
- Revisor verifica: comportamento coberto por testes que falhariam sem a mudança, tenant isolation, erros tipados, telemetria, docs.
- Feedback é resolvido por commits novos na branch; sem force-push em branch compartilhada.

## 7. Merge e integração

Trunk-based: `main` sempre verde e implantável. Merge por squash com mensagem em Conventional Commits. Branch apagada após o merge. Feature incompleta entra atrás de feature flag (`docs/development/feature-flags.md`).

## 8. Fechar (Definition of Done)

Critérios em `docs/checklists/definition-of-done.md`. Ao concluir um módulo: documentação atualizada, resumo de planejado versus entregue e próximos passos.

## 9. Decisões

Decisão estrutural → novo ADR (`docs/adr/README.md`), nunca edição de ADR `Accepted`. Dívida técnica aceita é registrada em `docs/risks/architecture-risk-register.md`.

## Papéis

| Papel | Responsabilidade |
| --- | --- |
| Dono do produto/repositório | Prioridade, escopo, aprovação de ADR e merge |
| Claude Code (agente) | Plano, implementação com TDD, testes, docs e resumo de riscos; não faz merge nem altera ADR aceito |

## Ritmo

Um módulo por vez, em fatias verticais. Ao fim de cada fatia: `main` verde, docs atualizadas, resumo curto do que mudou, riscos e próximo passo.
