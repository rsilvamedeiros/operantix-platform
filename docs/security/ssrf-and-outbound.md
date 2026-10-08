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

## Implemented state (M03)

`http_request` steps no `workflow-worker` (`apps/workflow-worker/README.md`):

- bloqueio por default de loopback, redes privadas, link-local/metadata, CGNAT, multicast e reservados (IPv4, IPv6, IPv4 mapeado);
- checagem sobre o IP resolvido no momento da conexão, contra DNS rebinding;
- redirects não são seguidos (sem hops a revalidar, sem credenciais repassadas);
- timeout (menor que o lease do job) e limite de tamanho da resposta;
- corpo da resposta fora das mensagens de erro.

Ainda pendente: allow/deny por tenant ou conector (M05) e egress proxy/network policy em produção (M09).
