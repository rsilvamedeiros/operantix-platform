# ecs-cluster

Cluster Fargate com Container Insights e a zona DNS privada (`operantix.internal`) em que os workloads se encontram, por exemplo `ai-service.operantix.internal`. Spot fica disponível mas não é o padrão: um worker interrompido perde o lease e o trabalho é refeito (ADR-0034).
