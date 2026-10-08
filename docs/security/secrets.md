# Secrets Management

Secrets nunca em Git, logs ou events. Local: `.env` não versionado. Cloud: secret manager. Connections armazenam referência/metadata, não exibem credential novamente. Rotação e revogação devem ser consideradas no design.

## Implemented state

- Secrets de integração (signing secrets de webhooks de saída e de entrada, credenciais de connections) ficam cifrados na tabela `secrets` com AES-256-GCM, presos a `<organization_id>/<secret_id>` (ADR-0022). Entidades guardam só a referência.
- Chaves em `SECRETS_ENCRYPTION_KEYS` (`id:base64`, a ativa primeiro). Erros de configuração nomeiam a entrada, nunca o valor.
- O valor só sai da API na criação ou rotação. Auditoria e eventos não o carregam.
- Credenciais de connections (`CONNECTION_CREDENTIAL`) nunca voltam pela API, nem na criação; só são enviadas para URLs dentro do `baseUrl` da connection (ADR-0025).
