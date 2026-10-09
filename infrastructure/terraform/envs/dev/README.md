# envs/dev

Ambiente de desenvolvimento na AWS (ADR-0040). Compõe os módulos de `../../modules`.

## O que sobe

Rede (3 camadas, 1 NAT), ECR, Secrets Manager (só os contêineres), PostgreSQL, Redis, cluster ECS, ALB HTTPS, os serviços `platform-api`, `workflow-worker`, `workflow-relay`, `integration-worker` e `ai-service`, a tarefa de migração e o papel que o workflow de deploy assume.

## Variáveis obrigatórias

`certificate_arn`, `image_tag`, `kafka_brokers`, `auth_issuer`, `auth_audience`, `auth_jwks_uri`. Coloque-as em um `terraform.tfvars` local (ignorado pelo git); nenhuma é segredo.

## Verificar sem credenciais

```bash
cd infrastructure/terraform/envs/dev
terraform init -backend=false
terraform validate
terraform test
```

## Ordem do primeiro uso (não executado ainda)

1. `apply` do ECR, depois publicar as imagens (workflow `deploy.yml` ou `docker push` manual com tag imutável).
2. `apply` completo com `image_tag` igual ao SHA publicado.
3. Gravar os valores dos segredos (README do módulo `secrets`).
4. Rodar a tarefa `operantix-dev-migrate` e criar os papéis de login do banco com suas senhas (ainda manual).
5. Configurar no GitHub Environment `dev` as variáveis da saída `github_environment_variables` e proteger o Environment.

O estado é local até existir um backend remoto (ADR-0040, follow-up); não compartilhe um `apply` entre pessoas antes disso.
