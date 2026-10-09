# Benchmark: timeline de execução (ADR-0041)

Compara o padrão de acesso da timeline (`execution_events`) em PostgreSQL e em DynamoDB, para decidir se vale levar a timeline para DynamoDB (ADR-0014).

## Rodar

```bash
docker run -d --name bench-pg -p 15432:5432 -e POSTGRES_PASSWORD=bench postgres:17
docker run -d --name bench-ddb -p 18000:8000 amazon/dynamodb-local:latest

uv run --with 'psycopg[binary]' --with boto3 python bench.py \
  --pg postgresql://postgres:bench@localhost:15432/postgres \
  --dynamodb http://localhost:18000
```

Os testes das partes puras (estatísticas e desenho de chaves): `uv run --with pytest pytest`.

## O que mede

Execuções em paralelo acrescentam seus eventos em ordem (escrita); depois execuções aleatórias são lidas como timeline completa e ordenada (leitura). Tabela e índice espelham `execution_events` sem RLS, chave estrangeira nem o gatilho append-only, que só acrescentariam custo ao PostgreSQL.

## Limites (leia antes de citar os números)

- **DynamoDB Local é um emulador** (Java sobre SQLite). Seus números não dizem nada sobre latência nem custo do serviço real; só mostram que o padrão de acesso cabe no modelo de chaves.
- PostgreSQL e DynamoDB Local rodam na mesma máquina de 4 vCPU que o gerador de carga, em contêineres sem ajuste. Os números do PostgreSQL são uma **ordem de grandeza** e um piso, não uma capacidade de produção.
- Uma única corrida por configuração; sem aquecimento nem repetição. Resultados em `results/`.
