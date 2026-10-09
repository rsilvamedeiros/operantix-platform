# Benchmark: busca vetorial por tenant com pgvector (ADR-0044)

Mede busca por vizinhos mais próximos em `pgvector` sob a mesma política de RLS que as tabelas do platform-api usam, comparando busca exata com HNSW. Mede recall contra o gabarito exato (numpy), quantas consultas voltam com menos resultados do que o tenant tem, e a latência.

## Rodar

```bash
docker run -d --name bench-vec -p 15433:5432 -e POSTGRES_PASSWORD=bench pgvector/pgvector:pg17

uv run --with numpy --with 'psycopg[binary]' python bench.py \
  --dsn postgresql://postgres:bench@localhost:15433/postgres
```

Testes das partes puras (corpus, gabarito exato, recall): `uv run --with numpy --with pytest pytest`.

## Variantes

Primeiro com o índice btree em `organization_id` (como no restante do esquema), depois sem ele, para forçar o planner a usar só o HNSW. Cada variante registra o caminho de acesso que o planner escolheu, para que ninguém meça uma coisa achando que mede outra.

## Limites

- **Embeddings sintéticos**: gaussianas agrupadas, cada tenant com poucos tópicos. Embeddings reais de texto podem se comportar diferente.
- 60 mil vetores de 384 dimensões, 30 tenants de 106 a ~7 mil vetores. O maior tenant é pequeno para o HNSW compensar; o que acontece com centenas de milhares de vetores num só tenant é extrapolação, não medição.
- Uma máquina de 4 vCPU, PostgreSQL em contêiner sem ajuste, uma corrida por configuração. A construção do HNSW não é determinística, então o recall varia de uma corrida para outra na segunda casa decimal.
