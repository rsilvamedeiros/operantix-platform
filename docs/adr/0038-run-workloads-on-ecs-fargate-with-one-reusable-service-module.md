# ADR-0038 — Run workloads on ECS Fargate with one reusable service module

**Status:** Accepted  
**Date:** 2026-10-09

## Context

`docs/infrastructure/ecs.md` prefere ECS/Fargate no início (EKS não é requisito do M09). Há cinco processos com perfis diferentes: API atrás de load balancer, dois tipos de worker, o relay do outbox (líder único, ADR-0021), o ai-service chamado por outros workloads, e a tarefa de migração, que roda uma vez por deploy. As imagens vêm do ADR-0035 e os secrets do ADR-0037.

## Decision

- **Um módulo `ecs-service` para todos**, parametrizado, em vez de um módulo por workload. A tarefa de migração é o mesmo módulo com `run_as_service = false` (só definição de task e roles).
- **Cluster e rede de serviços:** `ecs-cluster` (Fargate, Container Insights, Spot disponível mas fora do padrão, porque um worker interrompido perde o lease) e uma zona DNS privada do Cloud Map; o ai-service se registra nela e os workloads o chamam por nome.
- **Entrada pública:** módulo `alb`, HTTPS apenas com política TLS 1.3, alvos por IP sondados em `/health/ready` (readiness, para uma task sem banco sair da rotação).
- **Menor privilégio:** a role de execução lê somente os ARNs de secrets listados no serviço; a role da aplicação é vazia por padrão. Credenciais entram como `secrets` por referência, nunca como variáveis de ambiente em texto.
- **Container endurecido:** não privilegiado, raiz somente leitura com `/tmp` efêmero, sem IP público, imagem fixada por tag/digest (nunca `latest`).
- **Deploy seguro:** circuit breaker com rollback automático, 100% saudável mínimo, `stopTimeout` para terminar o lote do worker (ADR-0034).
- **Autoscaling por CPU** quando `max_count` é informado; o contador de tasks passa a ser do autoscaler.
- **Relay:** mesmo serviço com `command` próprio e 2 tasks; uma publica e a outra fica de reserva pelo advisory lock.

## Consequences

- **Escalar pela fila ainda não funciona na AWS.** Os gauges do ADR-0033 saem por OTLP; o ECS escala por métricas do CloudWatch. Falta um caminho OTLP para CloudWatch (por exemplo, um collector ADOT) e uma política de escala por `operantix_*_queue_depth`. Até lá vale a CPU, que é um sinal fraco para workers que esperam I/O.
- O ai-service só é alcançável dentro da VPC; sem autenticação além do bearer token (ADR-0028).
- `desired_count` passa a ser ignorado depois da criação (`ignore_changes`), então mudar o número de tasks é feito no autoscaler ou à mão.
- Os testes cobrem a forma das definições com provider simulado; permissões e quotas reais só aparecem num `plan` real.

## Alternatives

- Um módulo por workload: mais explícito, mas repete 90% do código.
- EKS: mais portável e com HPA/KEDA, porém custo operacional de cluster que o M09 explicitamente evita.
- ALB interno para o ai-service: mais um balanceador a pagar; Cloud Map basta enquanto houver poucas tasks.

## Follow-up

Caminho dos gauges para o CloudWatch e escala por fila. Alarmes (erro 5xx do ALB, idade da fila). Avaliar Spot para workers idempotentes. Rede do ECS para o ECR por endpoints de interface, se o custo de NAT justificar.
