# ADR-0036 — Provision AWS with Terraform modules, tested without credentials

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O M09 pede um ambiente AWS reproduzível (`docs/infrastructure/aws.md`: ECS/Fargate, RDS PostgreSQL, Redis gerenciado, secret manager). Precisamos escolher a ferramenta de IaC, como organizar o código e como verificá-lo sem uma conta AWS disponível no desenvolvimento nem no CI de PRs.

## Decision

- **Terraform** (`>= 1.9`, provider `hashicorp/aws ~> 6.0`), versões fixadas no CI. OpenTofu é compatível com este código, mas não é testado aqui.
- **Módulos pequenos e independentes** em `infrastructure/terraform/modules/<nome>`, cada um com `versions.tf`, `variables.tf`, `outputs.tf` e testes. Um módulo recebe o que precisa por variáveis (por exemplo, IDs de subnet) e não lê o estado de outro: a composição acontece nos ambientes (`infrastructure/terraform/envs/<ambiente>`).
- **Ambientes** `dev`, `staging` e `prod` (`docs/infrastructure/environments.md`) são raízes separadas, com conta, estado e credenciais próprios. Nenhuma raiz de ambiente é entregue nesta decisão; elas entram quando os módulos que as compõem existirem.
- **Estado remoto** em S3 com lock nativo, um estado por ambiente, criptografado e com versionamento. O bucket de estado é provisionado fora desse código (bootstrap manual e documentado), para não depender de si mesmo.
- **Teste sem credenciais:** `terraform fmt`, `validate` e `terraform test` com `mock_provider "aws"` e `command = apply`, que afirmam propriedades de segurança e topologia (por exemplo, a camada de dados não tem rota de saída). O CI roda isso em todo módulo e raiz (`.github/workflows/terraform.yml`). Plan e apply reais exigem uma conta e ficam para o pipeline de deploy.
- **Rede em três camadas** (pública, privada, dados) em pelo menos duas zonas, com NAT por zona (ou único em ambientes não produtivos), flow logs e security groups que só admitem a camada acima.
- Nenhum secret no código nem em variáveis com valor padrão; valores sensíveis vêm do ambiente de execução ou do Secrets Manager.

## Consequences

- Os testes com provider simulado garantem a forma do código, não o comportamento da AWS: erros de permissão, quota ou combinação inválida só aparecem em `plan`/`apply` reais.
- Cada módulo é revisável e publicável isoladamente; o custo é repetir variáveis na composição.
- O estado pode conter valores sensíveis (por exemplo, senhas geradas); o bucket precisa de acesso restrito e criptografia.

## Alternatives

- CDK ou Pulumi: linguagem de propósito geral, mas mais uma toolchain e menos revisável como declaração.
- Um único módulo grande: menos arquivos, porém acopla redes, dados e computação no mesmo ciclo de mudança.
- Testes com Terratest ou LocalStack: mais fiéis, mas exigem infraestrutura de teste que o projeto ainda não tem.

## Follow-up

Kafka na AWS (MSK ou autogerenciado) não está nos entregáveis do M09 e precisa de decisão própria. Scan de segurança de IaC (Checkov ou Trivy) no CI. Lock de providers (`.terraform.lock.hcl`) nas raízes de ambiente.
