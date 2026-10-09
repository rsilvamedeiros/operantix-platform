# ECS/Fargate

Preferência inicial de runtime AWS por reduzir custo operacional de cluster. Cada workload terá task definition/service independente, autoscaling e health checks. Workers podem escalar por queue/consumer metrics.

Implementado nos módulos `ecs-cluster`, `ecs-service` e `alb` (`infrastructure/terraform/modules`, ADR-0038). Escala por CPU; escala por fila depende de levar os gauges ao CloudWatch (follow-up do ADR-0038).
