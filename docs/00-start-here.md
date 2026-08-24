# Start Here

Este documento é a porta de entrada da arquitetura do Operantix.

## O que estamos construindo

Uma plataforma SaaS multi-tenant para modelar, executar e observar automações operacionais, integrações e workloads de IA. O produto deve permitir que equipes conectem sistemas, criem workflows, executem etapas tradicionais e de IA, acompanhem falhas/custos/latência e operem tudo com governança.

## O que NÃO estamos construindo inicialmente

- Um clone completo de Zapier/n8n.
- Uma plataforma Kubernetes-first.
- Um microservice por entidade.
- Um data lake enterprise.
- Billing completo antes do domínio central funcionar.
- Uma plataforma de agentes autônomos sem controles.

## Como navegar pela documentação

1. `product/`: por que o produto existe e quais capacidades possui.
2. `requirements/`: requisitos funcionais e não funcionais.
3. `architecture/`: visão de sistema, limites, comunicação, resiliência e evolução.
4. `domains/`: linguagem e responsabilidades de negócio.
5. `data/`: ownership, stores, migrations e retenção.
6. `events/`: Kafka, envelope, idempotência, retries e schemas.
7. `api/`: padrões REST/gRPC/webhooks.
8. `ai/`: arquitetura do serviço Python e governança de IA.
9. `security/`: controles obrigatórios.
10. `observability/`: logs, metrics, traces, SLOs e Dynatrace.
11. `infrastructure/`: local, AWS, Terraform e evolução para Kubernetes.
12. `testing/`: estratégia de qualidade.
13. `workflow/`: ordem prática de implementação.
14. `adr/`: decisões aceitas e decisões futuras.
15. `claude-code/`: como trabalhar com Claude Code neste repositório.

## Regra de evolução

O roadmap é deliberadamente incremental. Uma tecnologia descrita na arquitetura futura não está automaticamente autorizada para a fase atual. O módulo ativo e os ADRs determinam o que deve existir agora.

## Primeira implementação

Comece por `workflow/module-00-foundation.md`. O primeiro objetivo é um monorepo limpo, executável, testável e observável em nível básico — não um sistema distribuído completo.
