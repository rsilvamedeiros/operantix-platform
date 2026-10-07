# Operantix — Claude Code Project Instructions

## Mission

Construa Operantix como uma plataforma real de automação operacional e IA. Priorize clareza arquitetural, limites de domínio, observabilidade, segurança, testes e evolução incremental. Não transforme o projeto em uma coleção de tecnologias adicionadas apenas para demonstrar stack.

## Mandatory reading before implementation

Sempre que uma sessão iniciar em uma nova área:

1. Leia `docs/00-start-here.md`.
2. Leia o documento do módulo ativo em `docs/workflow/`.
3. Leia os ADRs relacionados em `docs/adr/`.
4. Leia as regras específicas da área em `.claude/rules/`.
5. Leia somente a documentação adicional necessária para a tarefa.

## Architectural invariants

- O repositório é um **polyglot monorepo**.
- O core transacional começa modular em NestJS; não extrair microserviços por CRUD.
- `platform-api` é dono do domínio transacional principal.
- Workers processam workloads assíncronos e devem ser idempotentes.
- Kafka é o backbone planejado de eventos a partir do módulo de eventing.
- PostgreSQL é o source of truth transacional.
- Redis não é source of truth.
- MongoDB, DynamoDB, Kubernetes e Temporal só entram quando o roadmap/ADR os autorizar.
- IA especializada vive no `services/ai-service` em Python.
- Comunicação entre serviços deve respeitar contratos versionados.
- Observabilidade com OpenTelemetry é requisito arquitetural, não melhoria opcional.
- Multi-tenancy e autorização devem ser consideradas em toda entidade e endpoint aplicáveis.

## Implementation protocol

Para cada módulo:

1. Confirme escopo e non-goals no documento do módulo.
2. Inspecione o código existente antes de criar novas abstrações.
3. Proponha plano curto e arquivos afetados.
4. Escreva primeiro o teste que falha (TDD, ADR-0016) e confirme que falha pelo motivo certo.
5. Implemente o menor incremento vertical que o faz passar; depois refatore com a suíte verde.
6. Adicione logs, métricas e traces quando aplicável.
7. Verifique segurança e tenant isolation.
8. Rode quality gates.
9. Atualize documentação afetada.
10. Resuma mudanças, riscos e próximos passos.

## Forbidden behaviors

- Não criar serviços novos sem justificativa arquitetural.
- Não compartilhar acesso irrestrito ao banco entre workloads.
- Não quebrar contratos existentes silenciosamente.
- Não introduzir dependência sem explicar necessidade e impacto.
- Não armazenar secrets no repositório.
- Não usar `any` como atalho estrutural em TypeScript.
- Não capturar exceções e ignorá-las.
- Não publicar eventos sem `eventId`, `eventType`, `eventVersion`, `occurredAt`, `traceId` e contexto de tenant quando aplicável.
- Não implementar retry sem idempotência e limite explícito.
- Não fazer refactors amplos fora do escopo do módulo atual.
- Não alterar um ADR `Accepted` retroativamente; crie um novo ADR que o substitua.
- Não escrever código de produção sem teste prévio que o exija, salvo exceção registrada em `docs/development/tdd.md`.
- Não pular, desabilitar ou apagar testes para obter build verde.

## Repository target structure

```text
apps/
  web/
  platform-api/
  workflow-worker/
  integration-worker/
services/
  ai-service/
packages/
  ui/
  contracts/
  sdk/
  telemetry/
  config/
  testing/
infrastructure/
  docker/
  terraform/
  kubernetes/
  observability/
docs/
```

## TypeScript conventions

- TypeScript strict.
- DTO boundary validation obrigatória.
- Domain logic fora de controllers.
- Dependency injection por abstrações estáveis quando houver integração externa.
- Preferir explicit types em contratos públicos.
- Erros de domínio tipados e mapeados na borda HTTP/event consumer.
- Não acoplar domínio a NestJS decorators quando isso prejudicar testabilidade.

## Python conventions

- Type hints obrigatórios em APIs públicas.
- Pydantic nos boundaries.
- pytest para testes.
- Providers de LLM atrás de abstrações próprias.
- Prompts versionados e observáveis.
- Nunca logar conteúdo sensível de prompt/resposta por padrão.

## Testing requirements

**TDD é a prática padrão** (ADR-0016, `docs/development/tdd.md`): teste antes do código, bug começa com teste que o reproduz, nunca pular/desabilitar teste para obter verde. O fluxo completo está em `docs/development/process.md`.

Toda mudança funcional deve considerar:

- unit tests para regra de negócio;
- integration tests para banco/mensageria/adapters;
- contract tests para interfaces entre workloads;
- E2E para fluxos críticos;
- load tests em pontos explicitamente definidos pelo módulo.

Consulte `docs/testing/strategy.md`.

## Security requirements

- Deny by default para autorização.
- Validar tenant em toda query multi-tenant.
- Secrets apenas via environment/secret manager.
- Input externo é não confiável.
- Webhooks precisam de assinatura, replay protection e idempotência.
- Nunca retornar stack trace ao cliente.

Consulte `docs/security/`.

## Documentation rules

Atualize documentação quando a implementação mudar comportamento, contratos, topologia ou decisão arquitetural. Se a decisão for estrutural, crie ADR.

## Preferred skills

Use as skills em `.claude/skills/` quando aplicáveis, especialmente:

- `/plan-module`
- `/implement-nest-module`
- `/implement-event`
- `/implement-worker`
- `/implement-ai-feature`
- `/database-change`
- `/observability-change`
- `/write-tests`
- `/architecture-review`
- `/security-review`
- `/review-changes`
- `/prepare-commit`

## Definition of done

Não considere uma tarefa concluída apenas porque compila. Verifique os critérios em `docs/checklists/definition-of-done.md`.
