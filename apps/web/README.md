# Web

Console Next.js (App Router) do Operantix. Não é dono de regra de negócio: consome a Platform API e a autorização continua no servidor (`.claude/rules/frontend.md`). Estilo e componentes vêm de `@operantix/ui` (ADR-0049).

## Rodar localmente

```bash
pnpm install
pnpm --filter @operantix/web dev      # http://localhost:3001 (a API usa a 3000)
```

A página inicial lê `GET /health/ready` da Platform API pelo servidor do Next. Sem API no ar ela mostra "Unreachable", sem detalhe do erro. A API sobe como descrito em `apps/platform-api/README.md`.

```bash
pnpm --filter @operantix/web build && pnpm --filter @operantix/web start
```

## Configuração

| Variável | Padrão | Notas |
| --- | --- | --- |
| `API_BASE_URL` | `http://localhost:3000` | Só no servidor (sem `NEXT_PUBLIC_`), então não vai para o bundle do navegador. Vazio vale como não definida; valor que não é URL `http(s)` derruba a página sem repetir o valor. |
| `NEXT_TELEMETRY_DISABLED` | | `1` desliga a telemetria anônima do Next. |

## Estrutura

- `src/app/`: rotas (Server Components por padrão). `/` é a visão geral; `/design` mostra tokens e componentes.
- `src/components/`: componentes do app (a casca com o roteador, o card de status).
- `src/lib/`: acesso à API e configuração, sem React.

## Testes

`pnpm --filter @operantix/web test` (Vitest, jsdom, Testing Library) e `test:coverage` com piso de 80%. Telas novas: componente com teste de papel/nome acessível; só a casca de rota (`page.tsx`) fica fora da cobertura.
