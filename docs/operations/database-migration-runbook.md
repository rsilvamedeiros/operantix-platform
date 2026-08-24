# Database Migration Runbook

- revisar duração/locking;
- confirmar backup/PITR em produção;
- aplicar expand step primeiro;
- monitorar DB locks, CPU/IO e error rate;
- executar backfill em batches quando necessário;
- deploy código compatível;
- contract/removal somente em release posterior.
