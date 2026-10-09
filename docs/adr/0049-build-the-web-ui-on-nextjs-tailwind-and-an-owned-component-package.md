# ADR-0049 — Build the web UI on Next.js, Tailwind and an owned component package

**Status:** Accepted  
**Date:** 2026-10-09

## Context

`apps/web` e `packages/ui` existem só como README. O produto precisa de uma base de layout e estilo antes de qualquer tela: sem ela, cada tela decide cores, espaçamentos e acessibilidade por conta própria. O web é consumidor da Platform API e não é dono de regra de negócio (`container-view.md`).

## Decision

- **Next.js (App Router) + React**, como previsto na arquitetura. Server Components por padrão; Client Components só onde há interação.
- **Tailwind CSS v4** para estilização, configurado em CSS (`@theme`). Os **design tokens** (cor, espaçamento, tipografia, raio, sombra) são variáveis CSS semânticas (`--color-surface`, `--color-primary`…), com tema claro e escuro trocando só os valores. Telas usam nomes semânticos, não cores cruas.
- **Componentes próprios em `packages/ui`**, no estilo "copiar e possuir" (como o shadcn/ui): primitivos pequenos, tipados, acessíveis, testados. Não adotamos uma biblioteca de componentes fechada; quando um primitivo complexo for necessário (diálogo, menu), adotamos o primitivo headless correspondente (Radix UI) por ADR ou nota no PR, e não escrevemos foco e ARIA à mão.
- **Dependências mínimas agora:** `clsx` + `tailwind-merge` (composição de classes) e `class-variance-authority` (variantes tipadas). Ícones (`lucide-react`) entram junto do primeiro componente que precisar deles.
- **Testes:** Vitest + Testing Library em jsdom para componentes, com asserções de papel/nome acessível; sem snapshot de marcação.
- **Layout:** uma `AppShell` (barra lateral, cabeçalho, área de conteúdo) responsiva, e primitivos de composição (`Stack`, `Card`, `PageHeader`). A navegação é dado tipado, não JSX espalhado.
- **Dados:** o web chama a Platform API do servidor (Server Components) com contratos de `@operantix/contracts`; nenhum estado global de cliente para cache de servidor.

## Consequences

- Visual e acessibilidade têm um único lugar para evoluir; telas ficam finas.
- Temos o custo de manter os primitivos, mas sem o lock-in nem o bundle de uma biblioteca grande.
- Tailwind v4 exige o plugin PostCSS e um build do Next com CSS em duas camadas (pacote ui + app); o `@source` do app aponta para `packages/ui`.
- Next.js entra no CI (build e testes), aumentando o tempo dos quality gates.

## Alternatives

- **MUI / Chakra / Mantine:** velocidade inicial maior, mas estilo e bundle impostos, e tema difícil de alinhar com tokens próprios.
- **CSS Modules / vanilla-extract:** sem utilitários, mais código por tela; o ganho de tipagem não compensa aqui.
- **Radix/shadcn CLI desde já:** adiciona dependências antes de existir um componente que as exija.
- **Storybook agora:** útil depois de haver componentes suficientes; adiado.

## Follow-up

- Decidir o contrato de sessão do web (cookie/BFF) antes das telas autenticadas.
- Avaliar Storybook ou testes visuais quando houver mais de ~15 componentes.
