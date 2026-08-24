# Architecture Overview

## Style

Operantix adota **modular core + distributed workers + event-driven evolution** em um polyglot monorepo.

## Logical view

```text
[Next.js Web]
      |
      v
[Platform API / NestJS] -----> [PostgreSQL]
      |                         [Redis]
      |
      +---- commands/events ---> [Kafka]
                                  |      |
                                  v      v
                           [Workflow] [Integration]
                            Worker      Worker
                                  \\      /
                                   v    v
                               [AI Service]
                              Python/FastAPI
```

## Why this shape

- O domínio transacional começa coeso.
- Workloads assíncronos têm perfil de escala diferente.
- AI tem runtime/ecossistema diferente e merece boundary próprio.
- Eventing desacopla producers e consumers onde isso cria valor.
- Deploys independentes preservam escalabilidade sem exigir repos separados.

## Architecture qualities

Prioridade: correctness, tenant isolation, observability, reliability, evolvability, performance mensurável e operational simplicity.
