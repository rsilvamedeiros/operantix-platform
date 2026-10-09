# Terraform

Decisão: ADR-0036. Cada módulo em `modules/` é independente e testado; os ambientes (`envs/`) compõem os módulos.

| Módulo | O que provisiona |
| --- | --- |
| `network` | VPC em três camadas (pública, privada, dados), NAT, flow logs e security groups |

## Verificar sem credenciais

```bash
cd infrastructure/terraform
terraform fmt -check -recursive
cd modules/network
terraform init -backend=false
terraform validate
terraform test        # provider AWS simulado; não toca em nenhuma conta
```

O CI roda o mesmo em todo módulo e ambiente (`.github/workflows/terraform.yml`). Plan e apply reais exigem uma conta AWS e não fazem parte deste repositório ainda.

## Convenções

- Um módulo recebe o que precisa por variáveis e expõe `outputs`; não lê o estado de outro módulo.
- Sem valores sensíveis em código, defaults ou `*.tfvars` versionados (`.gitignore` já os exclui).
- Toda propriedade de segurança relevante tem uma asserção em `*.tftest.hcl`.
