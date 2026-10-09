# ecs-service

Um workload no Fargate (ADR-0038). Reaproveitado por todos os processos; a diferença entre eles está nas variáveis.

| Workload | Imagem | Como configurar |
| --- | --- | --- |
| `platform-api` | `platform-api` | `container_port = 3000`, `target_group_arn` do módulo `alb`, 2 ou mais tasks |
| `workflow-worker` | `workflow-worker` | sem porta; `stop_timeout_seconds` acima do maior step |
| outbox relay | `workflow-worker` | `command = ["node", "dist/relay-main.js"]`; 2 tasks, uma ativa e a outra reserva (ADR-0021) |
| `integration-worker` | `integration-worker` | sem porta |
| `ai-service` | `ai-service` | `container_port = 8000`, `service_discovery_namespace_id` e `discovery_name = "ai-service"` |
| migração | `platform-api` | `run_as_service = false`, `command = ["node", "dist/database/migrate.js"]`, credenciais do dono do schema |

## O que o módulo garante

- Imagem fixada por tag ou digest; `latest` é recusado.
- Container não privilegiado, com sistema de arquivos raiz somente leitura (`/tmp` é um volume efêmero) e `init` para encerrar limpo.
- Credenciais entram só como `secrets` por ARN. A role de execução lê **apenas** os secrets listados; a role da aplicação é vazia, salvo `task_policy_json`.
- Tasks em subnets privadas, sem IP público. Deploy com circuit breaker e rollback automático.
- Logs no CloudWatch. `stop_timeout_seconds` dá tempo para terminar o lote em andamento depois do SIGTERM.
- Autoscaling por CPU quando `max_count` é informado; o contador de tasks passa a ser do autoscaler (`desired_count` só vale na criação).

Escalar pela fila (`docs/operations/autoscaling.md`) exige os gauges no CloudWatch, o que não está ligado: ver ADR-0038.
