# ADR-0037 — Run PostgreSQL, Redis and secrets on managed AWS services

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O M09 pede RDS PostgreSQL, Redis gerenciado, secret manager e backups (`docs/infrastructure/aws.md`, `backup-dr.md`). O PostgreSQL é o source of truth transacional (ADR-0003); Redis só coordena efemeramente (ADR-0012). Os workloads usam logins de banco separados por papel (ADR-0017, ADR-0018, ADR-0021, ADR-0023).

## Decision

- **RDS PostgreSQL 17** (mesma versão dos testes de integração): armazenamento criptografado, sem acesso público, TLS obrigatório, backups e PITR de 7 a 35 dias (zero não é permitido), proteção contra exclusão e snapshot final por padrão, Multi-AZ em produção.
- **Senha do dono do schema gerada pelo RDS** (`manage_master_user_password`), guardada no Secrets Manager: não passa pelo código nem pelo estado do Terraform. Esse login só serve à tarefa de migração.
- **Logins dos workloads criados fora do Terraform**, com os scripts de `infrastructure/docker/postgres`, e suas senhas gravadas nos secrets do módulo `secrets`. Criar usuários dentro do banco exigiria credenciais de banco no Terraform.
- **Secrets Manager: só os contêineres** no Terraform (um por credencial que os workloads leem); os valores são gravados fora do código. O ECS injeta cada um por ARN, com política de leitura limitada aos secrets do serviço.
- **ElastiCache Redis 7** criptografado em repouso, failover automático com mais de um nó, sem snapshots por padrão. **TLS em trânsito desligado** enquanto o cliente da `platform-api` não suportar TLS nem AUTH; a proteção é o security group (só workloads). É uma lacuna conhecida, com uma variável para ligar.
- Metas de RPO/RTO são **propostas** no runbook e só viram compromisso após um teste de restauração cronometrado.

## Consequences

- Um passo manual documentado depois de criar o banco (migrar, criar logins, gravar senhas). Aceito para manter credenciais fora do estado; automatizar é uma tarefa de deploy, não de Terraform.
- Redis sem TLS é um risco aceito e registrado; não corrige a ausência de AUTH.
- Chaves gerenciadas pela AWS por padrão; `kms_key_id` permite chave própria.
- Os testes com provider simulado afirmam as propriedades acima, não o comportamento do RDS real.

## Alternatives

- PostgreSQL autogerenciado em ECS ou EC2: mais controle, mas operar backup, failover e patch é custo sem ganho aqui.
- Aurora: melhor failover e leitura, mais caro e sem necessidade comprovada.
- Gerar senhas com `random_password` no Terraform: automatiza, mas grava segredos no estado.
- Parameter Store em vez de Secrets Manager: mais barato, sem rotação nativa e sem o suporte do RDS gerenciado.

## Follow-up

Habilitar TLS e AUTH no cliente Redis. Rotação automática das senhas dos logins. Definir o Kafka na AWS (MSK ou autogerenciado), fora dos entregáveis do M09.
