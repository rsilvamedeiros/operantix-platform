# SSRF & Outbound Network Security

HTTP steps/connectors permitem que usuários influenciem destinos externos, criando risco de SSRF.

## Controls to evaluate before public HTTP connector

- bloquear loopback/link-local/private metadata endpoints por default;
- DNS/IP revalidation contra rebinding;
- redirect limits e revalidação por hop;
- allow/deny policy por tenant/connector;
- egress proxy/network policy em produção;
- timeout e response size limit;
- não encaminhar credentials entre hosts após redirect.

Esse risco deve ser tratado antes de permitir URL arbitrária em produção.
