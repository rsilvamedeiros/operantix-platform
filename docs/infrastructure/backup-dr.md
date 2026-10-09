# Backup & Disaster Recovery

Definir RPO/RTO por ambiente antes de prometer. RDS backups/PITR na fase cloud. Testar restore. Object storage versioning quando necessário. DR inclui configurações, schemas, secrets references e runbooks, não apenas banco.

Implementado no módulo `postgres` (`infrastructure/terraform/modules/postgres`): backups automáticos e PITR de 7 a 35 dias, snapshot final e proteção contra exclusão. Metas propostas e procedimento: `docs/operations/backup-restore-runbook.md`.
