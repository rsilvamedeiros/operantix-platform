# UI Package

Design tokens e componentes React acessíveis compartilhados pelos frontends (ADR-0049). Sem regras de autorização de servidor: esconder um botão nunca é controle de segurança.

## Usar

```css
/* globals.css do app */
@import 'tailwindcss';
@import '@operantix/ui/styles.css';
@source '../../../../packages/ui/src'; /* o Tailwind precisa ler as classes do pacote */
```

```tsx
import { AppShell, Button, PageHeader } from '@operantix/ui';
```

O pacote publica TypeScript, sem build; o app o compila (`transpilePackages` no Next).

## O que há

| Peça | Notas |
| --- | --- |
| Tokens (`styles/tokens.css`) | Nomes semânticos (`bg-background`, `text-muted-foreground`, `bg-danger`...). Tema claro por padrão, escuro pelo sistema ou por `data-theme="dark" \| "light"` no `<html>`. |
| `Button`, `Badge`, `Card*`, `TextField` | Variantes tipadas (cva). `Button` é `type="button"` por padrão e `loading` desabilita e anuncia `aria-busy`. `TextField` liga rótulo, dica e erro por `aria-describedby`. |
| `AppShell`, `PageHeader` | Link de pular para o conteúdo, landmarks, navegação que vira menu em telas pequenas (Escape fecha e devolve o foco), `aria-current` na página atual. Aceita o link do roteador (`linkComponent`). |

## Regras

- Tela usa tokens semânticos, nunca cor crua. Todo par de texto e fundo dos tokens passa em WCAG AA nos dois temas (`tokens.test.ts` calcula o contraste).
- Componente novo nasce com teste de papel e nome acessível; `a11y.test.tsx` roda o axe em uma página completa. Contraste o axe não mede em jsdom, por isso fica nos tokens.
- Primitivo complexo (diálogo, menu, popover): adote o headless da Radix em vez de escrever foco e ARIA à mão, registrando a dependência no PR.

## Testes

`pnpm --filter @operantix/ui test` e `test:coverage` (piso de 80%).
