# Secrets Management

Secrets nunca em Git, logs ou events. Local: `.env` não versionado. Cloud: secret manager. Connections armazenam referência/metadata, não exibem credential novamente. Rotação e revogação devem ser consideradas no design.
