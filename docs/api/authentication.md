# API Authentication

Web users via OIDC/OAuth/JWT conforme provider escolhido. Implementado no `platform-api` como guard global deny-by-default que valida JWT pelo JWKS do issuer (`apps/platform-api/README.md`); rotas abertas são marcadas explicitamente com `@Public()`. Machine-to-machine/API access via API keys ou OAuth client credentials em evolução. API keys devem ser armazenadas hashed, prefixadas para identificação e revogáveis.
