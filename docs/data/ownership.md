# Data Ownership

## Rule

Cada tabela/collection possui owner lógico. Código de outro workload não importa ORM models/repositories do owner.

## Shared database initially

Compartilhar instância física é aceitável no início; compartilhar ownership não.

## Cross-boundary reads

Preferência:
1. API/query contract;
2. event-driven projection;
3. database view somente com decisão explícita e baixo acoplamento.

## Writes across workloads

Um workload pode escrever numa tabela que não é sua quando o owner concede só isso, por migration, e a escrita faz parte da mesma transação de uma mudança que o workload já pode fazer. Hoje: o workflow worker insere em `execution_events` (timeline) e `outbox_events` (eventos de contrato), ambas do `platform-api`, sem poder lê-las.
