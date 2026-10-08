# Docker Infrastructure

Compose/local infrastructure por profiles conforme fase.

## Serviços

- `postgres` (M00): scripts de `postgres/init` criam os papéis da API e do worker.
- `redis` (M00).
- `kafka` (M04): `apache/kafka:4.1.0` em KRaft, um nó, sem persistência (a outbox no PostgreSQL é a origem dos eventos). `kafka-init` roda `kafka/create-topics.sh` uma vez, depois que o broker fica saudável; rode de novo com `docker compose run --rm kafka-init` ao adicionar um tópico.
