# Backup and restore runbook (PostgreSQL)

O que existe: RDS com backups automáticos diários e PITR (7 a 35 dias, `modules/postgres`), snapshot final ao excluir e proteção contra exclusão. Redis não é fonte de verdade e não tem backup por padrão.

## Metas (propostas, a confirmar antes de prometer)

| Ambiente | RPO | RTO |
| --- | --- | --- |
| prod | até 5 minutos (PITR) | até 1 hora |
| staging | 1 dia | melhor esforço |
| dev | sem meta | sem meta |

O RPO decorre do PITR do RDS; o RTO só vale depois do primeiro teste de restauração cronometrado. Até lá, tratar o RTO como hipótese.

## Restaurar para um ponto no tempo

Restaurar sempre cria uma **instância nova**; a original não é alterada.

1. Decida o instante alvo (UTC), ou `latest-restorable-time`.
2. Restaure: `aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier <origem> --target-db-instance-identifier <origem>-restore --restore-time <instante> --db-subnet-group-name <grupo> --vpc-security-group-ids <sg-dados>` e espere ficar `available`.
3. Valide na instância nova, com o dono do schema: contagens das tabelas críticas (`organizations`, `executions`, `outbox_events`), última migração aplicada, `SELECT now()` contra o instante alvo.
4. Os papéis de login e suas senhas voltam junto com o banco. Confirme que os secrets `database/*` ainda valem.
5. Troque o tráfego: pare os workloads, aponte `DATABASE_HOST` para a instância restaurada (ou renomeie as instâncias), suba os workloads e acompanhe `/health/ready` e os gauges de fila (`docs/operations/autoscaling.md`).
6. Eventos do outbox já publicados após o ponto restaurado serão publicados de novo: os consumidores deduplicam por `eventId`.
7. Mantenha a instância antiga até confirmar a recuperação; depois remova-a (a proteção contra exclusão impede acidentes).

## Testar a restauração

Restauração não testada não conta como backup. Repita o procedimento acima em staging, cronometrando, ao menos a cada trimestre e depois de mudanças grandes de schema; registre o tempo e ajuste o RTO.

## Fora deste runbook

Recuperação de região inteira (multi-região é non-goal do M08/M09), restauração de secrets apagados (janela de recuperação de 30 dias do Secrets Manager) e do Kafka.
