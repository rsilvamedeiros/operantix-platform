# Operantix Platform

Operantix é uma plataforma multi-tenant de automação operacional e inteligência artificial orientada a eventos. O objetivo do repositório é construir um produto real e, ao mesmo tempo, manter uma base arquitetural forte para explorar backend Node.js/NestJS, frontend Next.js, Python para workloads de IA, mensageria, bancos especializados, observabilidade distribuída, segurança, resiliência, infraestrutura como código e cloud.

## Estado do repositório

Este pacote representa a **Foundation / Architecture v1**. Ele foi criado antes da implementação dos módulos para impedir que decisões fundamentais sejam tomadas de forma ad hoc durante a geração de código.

A implementação deve começar em `docs/workflow/module-00-foundation.md` e seguir o roadmap modular. Não implemente todos os serviços de uma vez.

## Arquitetura resumida

```text
Clients
  └─ Next.js Web
       └─ Platform API (NestJS)
            ├─ PostgreSQL
            ├─ Redis
            ├─ Kafka -> Workflow Worker (NestJS)
            ├─ Kafka -> Integration Worker (NestJS)
            └─ Kafka/HTTP -> AI Service (Python/FastAPI)

Cross-cutting:
OpenTelemetry · Authentication · RBAC · Multi-tenancy · Audit · CI/CD
```

## Workloads planejados

| Workload | Runtime | Responsabilidade |
|---|---|---|
| `apps/web` | Next.js / TypeScript | Interface web e experiência do produto |
| `apps/platform-api` | NestJS / TypeScript | API, tenancy, RBAC, domínio transacional e comandos |
| `apps/workflow-worker` | NestJS / TypeScript | Execução assíncrona de workflows |
| `apps/integration-worker` | NestJS / TypeScript | Integrações externas, webhooks, sincronizações e retries |
| `services/ai-service` | Python / FastAPI | Agents, RAG, embeddings, extração, classificação e avaliação |

## Data stores previstos

- PostgreSQL: source of truth transacional.
- Redis: cache, locks, rate limiting e coordenação efêmera.
- Kafka: backbone de eventos assíncronos.
- MongoDB: somente quando payloads/documentos flexíveis justificarem.
- pgvector: embeddings e busca semântica inicial.
- DynamoDB: estudo posterior para eventos de execução/alto volume; não adotar antes do ADR correspondente.

## Comece aqui

Quer só rodar o projeto? Siga `docs/development/getting-started.md`.

1. Leia `CLAUDE.md`.
2. Leia `docs/00-start-here.md`.
3. Leia `docs/product/vision.md` e `docs/product/capabilities.md`.
4. Leia `docs/architecture/overview.md` e `docs/architecture/principles.md`.
5. Leia os ADRs aceitos em `docs/adr/`.
6. Inicie `docs/workflow/module-00-foundation.md`.

## Princípio central

> Monorepo-first, modular core, distributed workers, event-driven evolution.

Monorepo não significa monólito operacional. Cada workload executável terá build, container, health checks, escala e deploy independentes.

## Documentação

O índice completo está em `docs/INDEX.md`.

## Claude Code

O repositório contém:

- `CLAUDE.md`: contexto persistente.
- `.claude/rules/`: regras modulares e regras por path.
- `.claude/skills/`: procedimentos reutilizáveis.
- `.claude/agents/`: revisores especializados em contexto isolado.

Consulte `docs/claude-code/README.md` antes de iniciar a primeira sessão de implementação.
