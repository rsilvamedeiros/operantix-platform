# Secrets Management

Secrets nunca em Git, logs ou events. Local: `.env` não versionado. Cloud: secret manager. Connections armazenam referência/metadata, não exibem credential novamente. Rotação e revogação devem ser consideradas no design.

## Implemented state

- Secrets de integração (hoje, signing secrets de webhook) ficam cifrados na tabela `secrets` com AES-256-GCM, presos a `<organization_id>/<secret_id>` (ADR-0022). Entidades guardam só a referência.
- Chaves em `SECRETS_ENCRYPTION_KEYS` (`id:base64`, a ativa primeiro). Erros de configuração nomeiam a entrada, nunca o valor.
- O valor só sai da API na criação ou rotação. Auditoria e eventos não o carregam.
