# Next.js

Server/client components usados intencionalmente. Data fetching e cache respeitam sensitivity e freshness. UI não contém autorização de segurança como único controle. Accessibility e performance fazem parte de done.

## Estado implementado (M11, ADR-0049)

- `apps/web` é Next.js App Router com Tailwind CSS v4; `packages/ui` guarda tokens e componentes (README de cada um).
- Server Components por padrão. Client Components só onde há interação ou hook de cliente (`AppShell`, `Shell`, `error.tsx`).
- Dados da API vêm do servidor, com `API_BASE_URL` sem prefixo `NEXT_PUBLIC_`; falha da API vira um estado na tela ("Unreachable"), nunca erro ou stack para o navegador. Respostas ao vivo não são cacheadas (`cache: 'no-store'`).
- Acessibilidade: landmarks, link de pular conteúdo, foco visível, `aria-current`, rótulos e erros ligados por `aria-describedby`. `tokens.test.ts` exige contraste WCAG AA nos dois temas e `a11y.test.tsx` roda o axe.
- Cabeçalhos de endurecimento (`nosniff`, `X-Frame-Options`, `Referrer-Policy`) em `next.config.ts`; uma CSP com nonce entra junto da autenticação.
- Ainda fora: autenticação e sessão do web, telas de produto, Storybook, i18n, deploy do web.
