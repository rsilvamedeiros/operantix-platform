# github-oidc

Papel que o workflow `deploy.yml` assume por OIDC, sem chave de acesso (ADR-0039).

```hcl
module "deploy_role" {
  source                   = "../../modules/github-oidc"
  name                     = "operantix-dev-deploy"
  github_repository        = "rsilvamedeiros/operantix-platform"
  github_environment       = "dev"
  ecr_repository_arns      = module.ecr.repository_arns
  ecs_cluster_arn          = module.cluster.cluster_arn
  ecs_service_arns         = [for s in module.service : s.service_arn]
  task_definition_families = [for s in module.service : s.task_definition_family]
  pass_role_arns           = flatten([for s in module.service : [s.execution_role_arn, s.task_role_arn]])
}
```

## Confiança

O papel só é assumido por um token com `aud = sts.amazonaws.com` e `sub = repo:<owner>/<repo>:environment:<env>`, por igualdade exata. Um job só recebe esse `sub` se rodar no **GitHub Environment** de mesmo nome; configure nele aprovadores e as branches permitidas, que passam a ser o portão do deploy.

Há um provedor OIDC do GitHub por conta AWS. Em uma conta com mais de um ambiente, o primeiro cria (`create_oidc_provider = true`) e os demais informam `oidc_provider_arn` com `create_oidc_provider = false`.

## Permissões

Push de imagem nos repositórios listados; registrar task definitions (a AWS não aceita recurso aqui); atualizar só os serviços listados; `RunTask` só nas famílias e no cluster listados; `iam:PassRole` só nos papéis listados e só para `ecs-tasks.amazonaws.com`. Não cria nem altera infraestrutura.

> `service_arn` ainda não é uma saída do módulo `ecs-service`; a composição de `envs/dev` o monta a partir de `service_name` e do cluster, ou acrescenta a saída em um PR próprio.

## Variáveis do GitHub Environment

`AWS_ROLE_ARN`, `AWS_REGION`, `ECS_CLUSTER`, `NAME_PREFIX`, `ECR_REGISTRY`, `PRIVATE_SUBNET_IDS`, `APP_SECURITY_GROUP_ID`. Nenhuma é secreta.
