# postgres

RDS PostgreSQL privado e criptografado para o core transacional (ADR-0037).

- Armazenamento criptografado, `publicly_accessible = false`, TLS obrigatório (`rds.force_ssl`).
- Senha do dono do schema gerada e guardada pelo próprio RDS no Secrets Manager (`manage_master_user_password`): nunca passa pelo código nem pelo estado. A saída `master_user_secret_arn` serve só para a tarefa de migração.
- Backups automáticos e recuperação em ponto no tempo (PITR): `backup_retention_days` entre 7 e 35.
- Proteção contra exclusão e snapshot final por padrão; desligue só em ambientes descartáveis.
- `multi_az = true` é exigido em produção.

Uso:

```hcl
module "postgres" {
  source             = "../../modules/postgres"
  name               = "operantix-prod"
  subnet_ids         = module.network.data_subnet_ids
  security_group_ids = [module.network.data_security_group_id]
  multi_az           = true
}
```

## Depois de criar

O banco nasce só com o dono do schema. Com as credenciais dele, aplique as migrações (`node dist/database/migrate.js` na imagem do `platform-api`) e crie os logins dos workloads com os scripts de `infrastructure/docker/postgres/*-role.sql` (`app`, `worker`, `relay`, `integration`), gravando cada senha no secret correspondente do módulo `secrets`. Os papéis não têm `SUPERUSER` nem `BYPASSRLS` (ADR-0017).
