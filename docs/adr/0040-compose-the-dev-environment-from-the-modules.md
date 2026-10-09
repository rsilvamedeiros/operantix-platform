# ADR-0040 — Compose the dev environment from the modules

**Status:** Accepted  
**Date:** 2026-10-09

## Context

Os módulos Terraform (ADR-0036 a 0039) são independentes e testados isoladamente, mas nada os junta num ambiente. Faltava definir como os workloads recebem imagem, configuração e credenciais, e provar que a composição respeita o isolamento que os ADRs de banco e segredos exigem. Sem conta AWS, só dá para validar e testar com provider simulado.

## Decision

- `infrastructure/terraform/envs/dev` é uma raiz própria (um estado por ambiente) que instancia rede, ECR, secrets, Postgres, Redis, cluster ECS, ALB, os cinco serviços, a tarefa de migração e o papel de deploy.
- **Dimensionado por custo, não por disponibilidade:** um NAT, banco em uma AZ sem proteção de deleção nem snapshot final, uma task por worker, ECR com `force_delete`. Produção ganha outra raiz com as escolhas opostas; nada disso vira default dos módulos.
- **Um mapa de workloads** (`local.workloads`) alimenta um único `for_each` do módulo `ecs-service`: imagem, comando, porta, ambiente e segredos de cada processo ficam lado a lado. O relay do outbox usa a imagem do `workflow-worker` com `node dist/relay-main.js` (ADR-0021).
- **Isolamento de credenciais:** cada workload recebe só o seu login de banco (`database/<workload>`); a tarefa de migração é a única que lê o segredo do dono do schema (`master_user_secret`). O token do AI service chega só ao AI service e ao workflow worker; o chaveiro `SECRETS_ENCRYPTION_KEYS` só à API e aos workers que cifram ou decifram (ADR-0022/0025). Testes afirmam o mapeamento.
- **Imagens:** `<conta>.dkr.ecr.<região>.amazonaws.com/operantix/<imagem>:<image_tag>`, com `image_tag` obrigatório e sem `latest`. O Terraform só define o ponto de partida; o workflow de deploy (ADR-0039) avança as revisões. O módulo ignora mudanças em `desired_count`, mas não na task definition: um `apply` posterior volta os serviços para `image_tag`, então use nele o SHA que está no ar.
- **Fora desta raiz, fornecido por variável:** certificado ACM, brokers Kafka (sem módulo de Kafka ainda, ver ADR-0036), URLs do provedor OIDC e o endpoint OTLP (opcional).
- **Segredos:** a raiz cria só os contêineres; os valores são gravados fora do Terraform (README do módulo `secrets`).

## Consequences

- A composição achou dois defeitos que os testes do módulo, com valores literais, não mostravam: o `ecs-service` decidia `count` por ARNs de segredo e pelo id do namespace, que só existem depois do apply. No primeiro `apply` real isso falharia com "Invalid count argument". Agora decide por chaves do mapa e por `discovery_name`.
- Os papéis de login do banco (`operantix_app`, `operantix_worker`, `operantix_relay`, `operantix_integration`) e suas senhas ainda precisam ser criados depois da migração, a partir dos segredos; isso não está automatizado e é pré-requisito do primeiro deploy.
- Nada foi aplicado: os testes provam fiação e isolamento, não comportamento da AWS.

## Alternatives

- **Terraform workspaces:** compartilham código mas também estado e provider; uma raiz por ambiente deixa a diferença explícita.
- **Um módulo `environment`:** esconderia a composição atrás de mais uma camada para um único consumidor.
- **Terragrunt/Atlantis:** ferramenta nova sem necessidade com um ambiente.

## Follow-up

- Automatizar a criação dos papéis de banco.
- Backend remoto de estado (S3 com lock) antes do primeiro `apply` compartilhado.
- Raiz `prod` e módulo de Kafka.
