# Load & Performance Tests

Cenários: API burst, workflow trigger rate, consumer lag recovery, slow provider. Capturar p50/p95/p99 e saturation.

## Pipeline de execuções (implementado)

`apps/workflow-worker/test/load/pipeline.load.test.ts`, projeto Vitest `load`, fora do CI:

```bash
pnpm --filter @operantix/workflow-worker test:load
LOAD_EXECUTIONS=1500 LOAD_WORKERS=8 pnpm --filter @operantix/workflow-worker test:load
```

Semeia uma rajada de execuções (3 steps, 5 tenants) e as drena com N réplicas de worker sobre PostgreSQL real (Testcontainers). Afirma os invariantes que valem em qualquer carga: todas as execuções terminam `SUCCEEDED`, nenhum job sobra e **cada step roda exatamente uma vez**. Imprime vazão e latência (do `created_at` ao `finished_at`, incluindo a espera na fila da rajada). Velocidade absoluta não é afirmada: depende da máquina.

Referência (4 vCPU, banco no mesmo host, 2026-10-09):

| Execuções | Workers | Vazão | p50 / p95 / p99 |
| --- | --- | --- | --- |
| 600 | 4 | 98,6/s | 4,6 / 5,9 / 6,0 s |
| 1500 | 1 | 38,0/s | 23,6 / 37,5 / 39,0 s |
| 1500 | 8 | 125,4/s | 9,8 / 11,6 / 11,9 s |

Leitura: escala bem até cerca de 4 réplicas e depois o PostgreSQL vira o gargalo. Use os números para comparar mudanças na mesma máquina, não como meta.

## API burst (script pronto, não executado aqui)

`tests/load/start-execution.k6.js`: inicia execuções a taxa de chegada constante (`RATE`, `DURATION`) com `Idempotency-Key` novo por iteração. Precisa de uma stack no ar e de um access token válido (a API valida contra um JWKS externo). Os limiares do script (p95 < 500 ms, p99 < 1,5 s, falhas < 1%) são ponto de partida: calibre contra uma medição real antes de aplicá-los. O script passou apenas em checagem de sintaxe; k6 não estava disponível no ambiente em que foi escrito.

## Pendentes

- Lag de consumidor Kafka e recuperação após backlog.
- Provider lento (HTTP e IA) e seu efeito na vazão.
- Webhooks: vazão do dispatcher com destinos lentos e circuito aberto.
