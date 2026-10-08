# Docker Infrastructure

Compose/local infrastructure por profiles conforme fase.

## Serviços

- `postgres` (M00): scripts de `postgres/init` criam os papéis da API, do worker, do relay da outbox e do integration worker. Eles só rodam num volume vazio; num volume existente, rode `postgres/relay-role.sql` e `postgres/integration-role.sql` à mão (`psql -v relay_password=... -f`, `psql -v integration_password=... -f`).
- `redis` (M00).
- `otel-collector`, `tempo`, `prometheus`, `grafana` (M07): profile `observability`, ver `infrastructure/observability/README.md`.
- `kafka` (M04): `apache/kafka:4.1.0` em KRaft, um nó, sem persistência (a outbox no PostgreSQL é a origem dos eventos). `kafka-init` roda `kafka/create-topics.sh` uma vez, depois que o broker fica saudável; rode de novo com `docker compose run --rm kafka-init` ao adicionar um tópico.
