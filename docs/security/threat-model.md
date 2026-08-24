# Threat Model

## Assets
Credentials de integrations, tenant data, API keys, workflow definitions, execution payloads e AI context.

## Primary threats
Cross-tenant access, stolen credentials, webhook forgery/replay, SSRF via HTTP steps, prompt/tool injection, excessive privilege, secret leakage in logs, dependency compromise, abusive automation.

## Review
Cada novo connector/step type deve atualizar ameaças relevantes.
