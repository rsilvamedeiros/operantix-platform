# ecr

Um repositório ECR por imagem (ADR-0039).

```hcl
module "ecr" {
  source       = "../../modules/ecr"
  repositories = ["operantix/platform-api", "operantix/workflow-worker", "operantix/integration-worker", "operantix/ai-service"]
}
```

- Tags **imutáveis**: uma tag publicada nunca passa a apontar para outra imagem. O deploy usa o SHA do commit.
- Scan no push e criptografia em repouso (AES-256; informe `kms_key_arn` para usar uma chave própria).
- Ciclo de vida: imagens sem tag expiram em `untagged_expire_days` (7); as `keep_tagged_images` (30) mais recentes são mantidas. Mantenha a imagem em produção dentro dessa janela ou aumente o valor.
- `force_delete = false` por padrão: um repositório com imagens não é apagado por engano.

Saídas: `repository_urls` (nome para URL) e `repository_arns` (para o papel de deploy).
