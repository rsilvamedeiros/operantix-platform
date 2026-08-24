# Runtime Topology

## Local

Apps podem rodar no host com hot reload; infraestrutura básica em containers.

## Development cloud

Containers separados, banco/cache managed quando disponível, observabilidade centralizada.

## Production target

```text
CDN/WAF -> Load Balancer -> Web/API replicas
                            |
                         Kafka
                        /     \
                  Workflow  Integration
                    Worker     Worker
                        \      /
                        AI Service

Managed PostgreSQL / Redis / Object Storage / Observability
```

Kubernetes não é requisito para a primeira topologia de produção; ECS/Fargate é evolução preferencial inicial.
