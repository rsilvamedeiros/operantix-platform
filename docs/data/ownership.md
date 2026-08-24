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
