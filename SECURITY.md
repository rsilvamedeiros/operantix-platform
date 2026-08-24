# Security Policy

## Reporting

Não publique credenciais, tokens, chaves, dados pessoais, payloads reais de clientes ou detalhes exploráveis de vulnerabilidades em issues públicas.

## Development baseline

- Secrets fora do Git.
- Dependências verificadas.
- Validação de input nas bordas.
- Autorização deny-by-default.
- Queries multi-tenant com filtro de tenant obrigatório.
- Logs sem dados sensíveis por padrão.
- Privilégio mínimo em infraestrutura.

A estratégia detalhada está em `docs/security/`.
