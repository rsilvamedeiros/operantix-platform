# ADR-0039 — Deploy from GitHub Actions with OIDC and explicit migrations

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O M09 precisa levar as imagens do ADR-0035 até o ECS do ADR-0038. Chaves de acesso de longa duração no GitHub são o caminho mais comum e o pior: vazam, não expiram e dão a quem as tem o mesmo poder que o pipeline. As migrações (ADR-0017) usam credenciais de dono do schema, que nenhum serviço em execução deve ter, então não podem rodar no boot dos serviços.

Não há conta AWS disponível neste ambiente: o que segue foi validado por `terraform validate`/`test` com provider simulado e por revisão, nunca executado.

## Decision

- **ECR** (`modules/ecr`): um repositório por imagem, tags **imutáveis**, scan no push, criptografia em repouso, e política de ciclo de vida (não marcadas expiram em 7 dias; mantém as 30 imagens marcadas mais recentes).
- **Identidade do pipeline** (`modules/github-oidc`): provedor OIDC do GitHub e um papel cuja confiança exige `aud = sts.amazonaws.com` e `sub = repo:<owner>/<repo>:environment:<env>`, sempre com correspondência exata. Só um job que roda num **GitHub Environment** com esse nome assume o papel, então as regras de proteção do Environment (aprovadores, branches permitidas) são o portão do deploy.
- **Permissões mínimas do papel:** push só nos repositórios listados; `RegisterTaskDefinition` (a AWS não aceita recurso aqui); `UpdateService` só nos serviços listados; `RunTask` só nas famílias listadas e no cluster listado; `iam:PassRole` só nos papéis de tarefa e execução, e só para `ecs-tasks.amazonaws.com`. O papel não cria nem altera infraestrutura: isso fica com o Terraform.
- **Workflow** `deploy.yml`, apenas `workflow_dispatch` (nada faz deploy sozinho): constrói e envia as quatro imagens com a tag igual ao SHA do commit; **roda a migração** como tarefa avulsa da imagem do `platform-api` (`node dist/database/migrate.js`) e aborta o deploy se ela falhar; só então registra novas revisões de task definition e atualiza cada serviço, esperando a estabilização. O circuit breaker do ADR-0038 reverte um serviço que não fica saudável.
- A lógica de deploy fica em `scripts/deploy/ecs-deploy.sh` (e não embutida no YAML) para poder ser lida e testada com `shellcheck`.
- Configuração do ambiente (role ARN, região, cluster, sub-redes, security group, prefixo, registry) vem de *variables* do GitHub Environment, nunca de secrets de longa duração.

## Consequences

- Nenhuma credencial AWS fica no GitHub. Um token OIDC vale por minutos.
- Migração antes do código novo exige migrações **compatíveis com a versão anterior** (expand/contract); uma migração destrutiva precisa ser dividida em dois deploys.
- Se a migração passa e o deploy falha, o banco já está na versão nova: por isso a regra acima.
- O fluxo não foi exercitado contra a AWS. A primeira execução real em `dev` é parte do critério de aceite do M09 e deve ser feita com o Environment protegido.
- Não há promoção entre ambientes automatizada: cada deploy é um despacho explícito.

## Alternatives

- **Chaves de acesso em secrets do GitHub:** descartado pelos riscos acima.
- **Migrar no boot de cada serviço:** exige credenciais de dono do schema em runtime e corre entre réplicas.
- **Deploy por Terraform (`apply` a cada imagem):** mistura mudança de infraestrutura com liberação de código e dá ao pipeline poder demais.
- **CodePipeline/CodeDeploy:** mais peças e outra superfície de permissões sem ganho para o tamanho atual.

## Follow-up

- Composição `envs/dev` que instancia estes módulos e a família `*-migrate`.
- Deploy blue/green só se o circuit breaker se mostrar insuficiente.
- Assinatura de imagens (cosign) e política de admissão.
