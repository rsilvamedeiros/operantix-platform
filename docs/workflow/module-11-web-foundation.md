# Module 11 — Web Foundation

## Goal

Dar ao `apps/web` e ao `packages/ui` uma base real de layout e estilização, e deixar o setup do projeto reproduzível por qualquer pessoa em poucos passos.

## Prerequisites

- M00–M10 concluídos.
- ADR-0049 lido.
- `docs/development/next.md` e `.claude/rules/frontend.md` lidos.

## Deliverables

- Passo a passo de configuração (`docs/development/getting-started.md`), validado executando os comandos.
- Design system mínimo em `packages/ui`: tokens (cor, espaçamento, tipografia, raio), tema claro/escuro e primitivos acessíveis.
- Casca do `apps/web` (Next.js App Router): layout raiz, `AppShell` com navegação, uma página de status que consome a Platform API e uma página `/design` com tokens e componentes.
- Testes de componente e checagem de acessibilidade (axe em jsdom; contraste nos tokens).

## Non-goals

- Autenticação e telas de produto (workflows, execuções): entram quando o contrato de sessão do web for decidido.
- Biblioteca de componentes de terceiros completa, Storybook, i18n e analytics.
- Regra de autorização no cliente: a API continua a única autoridade.

## Implementation sequence

1. ADR-0049 com a escolha de stack e estilização.
2. Guia de configuração.
3. Tokens e primitivos em `packages/ui` com testes.
4. Casca do `apps/web` usando `@operantix/ui`.
5. CI: lint, typecheck, build e testes do web e do ui nos quality gates.
6. Atualizar docs afetados.

## Acceptance criteria

- `pnpm install && pnpm dev` sobe o web, e o guia reproduz isso em máquina limpa.
- Build, typecheck, lint e testes passam; o CI cobre o web e o ui.
- Contraste e foco visível seguem WCAG AA nos tokens; componentes navegáveis por teclado.
- Nenhum segredo no bundle do cliente; a URL da API vem de uma variável de ambiente só de servidor (`API_BASE_URL`, sem `NEXT_PUBLIC_`).
- Cada dependência nova está justificada no ADR-0049 (`axe-core`, só em teste, entra com a verificação de acessibilidade).

## Claude Code

Comece com `/plan-module docs/workflow/module-11-web-foundation.md` e finalize com `/review-changes`.
