# Spike: Temporal (ADR-0042)

Roda uma definição de workflow do Operantix (schemaVersion 1) como um workflow Temporal e mede o que o engine próprio faz hoje.

## O que tem aqui

- `plan.py`: traduz uma definição em um plano (timer ou activity, com tentativas e timeouts iguais aos do worker atual). Testado em `test_plan.py`.
- `spike.py`: um único workflow genérico que interpreta o plano, as activities (versões mínimas dos steps) e os três cenários.

## Rodar

```bash
docker run -d --name bench-pg -p 15432:5432 -e POSTGRES_PASSWORD=bench postgres:17
docker run -d --name temporal --network host -e DB=postgres12 -e DB_PORT=15432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PWD=bench -e POSTGRES_SEEDS=127.0.0.1 \
  temporalio/auto-setup:1.28.1

uv run --with pytest pytest
uv run --with temporalio python spike.py all
```

## Limites

- Uma máquina de 4 vCPU divide o servidor Temporal, o PostgreSQL, o worker Python e o gerador de carga. A vazão serve de ordem de grandeza.
- O worker do spike é Python; um worker TypeScript teria outro custo. O servidor é o `auto-setup` sobre PostgreSQL, que é uma configuração de desenvolvimento.
- As activities são versões mínimas: não aplicam a política SSRF, não resolvem conexões nem gravam timeline ou outbox.
