# Tenant Isolation

Cross-tenant data exposure é severidade crítica. TenantContext é derivado de principal autorizado, não aceito cegamente do body. Repositories tenant-bound exigem tenant context. Testes negativos de isolamento são obrigatórios em endpoints críticos.

## Implementação no platform-api

- Tenant = organização. RLS forçado nas tabelas tenant-bound, com o tenant definido por transação (`withTenant`, ADR-0017).
- O `TenantContext` vem do `:organizationId` da rota, aceito só depois de achar a membership do `sub` do token; não membro recebe `404`.
- Única leitura entre tenants: o escopo de usuário (`withUser`), que mostra as memberships e organizações do próprio usuário, somente leitura.
