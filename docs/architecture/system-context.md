# System Context

## Actors

- End user via Operantix Web.
- External application via REST/API key.
- External SaaS/provider via webhook/OAuth.
- Platform operator.
- AI provider.

## External systems

```text
User -> Operantix -> CRM / Ticketing / Messaging / Storage
                  -> LLM Providers
                  -> Identity Provider
                  -> Observability Backend
```

## Trust boundaries

- Browser → edge/API.
- External webhook → ingress.
- API → internal workers.
- Workload → data store.
- AI Service → third-party LLM.

Cada boundary exige autenticação, validação, timeout e observabilidade adequados.
