# ADR-0017 — Use Drizzle and row-level security for PostgreSQL access

**Status:** Accepted  
**Date:** 2026-10-07

## Context

O M01 cria as primeiras tabelas transacionais (usuários, organizações, workspaces e memberships). O ADR-0003 define PostgreSQL como source of truth e o ADR-0007 escolhe schema compartilhado com discriminator de tenant, o que torna vazamento entre tenants o principal risco de dados. As docs de dados exigem ownership por módulo (`docs/data/ownership.md`) e migrations revisáveis com análise de lock, backfill e rollback (`docs/data/migrations.md`). O ADR-0011 exige outbox na mesma transação da mudança de estado.

## Decision

1. **Drizzle ORM** (`drizzle-orm` com driver `pg`) para acesso a dados no `platform-api`, com schema em TypeScript **por módulo** (cada módulo declara só as suas tabelas).
2. **drizzle-kit** gera migrations em **SQL**, versionadas em `apps/platform-api/migrations/` e revisadas no PR. Mudanças que o gerador não expressa (RLS, expand/contract, backfill) são migrations SQL escritas à mão. Migrations rodam como etapa explícita (`pnpm db:migrate`), nunca no boot da API.
3. **Row-level security** como segunda barreira de tenant isolation em toda tabela tenant-bound:
   - `ENABLE` + `FORCE ROW LEVEL SECURITY`, com policy `organization_id = current_setting('app.organization_id')`;
   - a API acessa dados tenant-bound só dentro de `withTenant(organizationId, fn)`, que abre uma transação e faz `set_config('app.organization_id', ..., true)` (escopo da transação, nunca vaza para outra request no pool);
   - sem tenant definido, a policy não retorna nenhuma linha (deny by default).
4. **Papéis de banco separados**: as migrations rodam com o owner do schema; a API conecta com um papel sem `SUPERUSER` e sem `BYPASSRLS` (`operantix_app`), que só tem DML. Superusers ignoram RLS, então a API nunca usa um.

O filtro explícito por tenant nos repositories continua obrigatório; o RLS cobre o erro humano de esquecê-lo.

## Consequences

- SQL e filtro de tenant ficam visíveis no código e testáveis contra PostgreSQL real.
- Sem geração de client no build/CI.
- Toda operação tenant-bound precisa de transação (custo pequeno; também é o que o outbox exige).
- Operações cross-tenant legítimas (ex.: listar as organizações de um usuário) exigem policy específica e explícita, revisada como mudança de segurança.
- `drizzle-kit` é menos maduro que o Prisma Migrate em migrations complexas; essas são escritas à mão.

## Alternatives considered

- **Prisma**: melhor DX e ecossistema, mas client único com todas as tabelas (fere ownership por módulo) e RLS por transação exige extension que embrulha cada query.
- **TypeORM**: integração nativa com Nest, mas decorators nas entidades acoplam domínio ao ORM.
- **Kysely + SQL à mão**: máximo controle, mais código de mapeamento e sem geração de migrations.
- **Só filtro na aplicação, sem RLS**: mais simples, mas uma query sem filtro vira vazamento silencioso.

## Follow-up

- Reavaliar quando o Drizzle 1.0 estabilizar.
- Workers (M03/M04) que acessarem o banco recebem papel próprio, com privilégios só nas tabelas que possuem.
