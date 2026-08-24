# Tenant Isolation

Cross-tenant data exposure é severidade crítica. TenantContext é derivado de principal autorizado, não aceito cegamente do body. Repositories tenant-bound exigem tenant context. Testes negativos de isolamento são obrigatórios em endpoints críticos.
