# ADR-0022 — Encrypt integration secrets in PostgreSQL behind a secret store

**Status:** Accepted  
**Date:** 2026-10-08

## Context

O M05 traz os primeiros secrets de tenant: o signing secret de cada webhook endpoint e, depois, credenciais de connections. `docs/security/secrets.md` exige que eles nunca apareçam em Git, logs ou eventos e que a entidade guarde só uma referência. O ambiente local não tem secret manager, e o M09 (cloud) ainda não definiu um. Quem grava o secret é o `platform-api`; quem usa é o integration worker.

## Decision

- **Referência, não valor**: a tabela `secrets` (dona: módulo de integrações do `platform-api`) guarda `id`, `organization_id`, `kind`, `key_id` e `ciphertext`. Entidades apontam para `secrets.id` por FK composta com `organization_id`, então um secret nunca é de outro tenant. A API devolve o valor só na criação ou rotação e nunca de novo.
- **Cifra**: AES-256-GCM (`@operantix/secrets`), nonce aleatório de 12 bytes por secret, tag de 16 bytes. O dado adicional autenticado é `<organization_id>/<secret_id>`, então um ciphertext copiado para outra linha ou tenant não abre.
- **Chaves**: `SECRETS_ENCRYPTION_KEYS=id:base64[,id:base64...]`, a primeira ativa. Cada secret guarda o `key_id` que o selou; rotacionar a chave é pôr uma nova na frente e manter a antiga até re-selar os secrets existentes.
- **Abstração**: o `platform-api` só sela, via `SecretStore`. Workloads que usam o valor abrem com o mesmo keyring e o mesmo contexto (`secretContext`). Trocar o backend (KMS, Secrets Manager) muda a implementação, não as entidades.
- **Isolamento**: RLS por tenant em `secrets`. O papel da API não decifra nada; papéis de workload recebem `SELECT` só quando precisarem.

## Consequences

- Um dump do banco sem as chaves não revela secrets; com as chaves, revela. As chaves ficam fora do banco (env local, secret manager em cloud).
- Toda instância que decifra precisa do keyring. Hoje são o `platform-api` (só cifra) e o integration worker.
- Rotação de chave sem re-selar deixa a chave antiga necessária indefinidamente. Um job de re-selagem fica para quando houver rotação real.
- Rotação do signing secret de um webhook é imediata: o destino precisa trocar o secret junto. Assinatura dupla durante uma janela de transição pode vir depois.

## Alternatives considered

- **Secret manager externo já (Vault, AWS Secrets Manager)**: melhor em produção, mas adiciona infraestrutura local antes do M09. A interface `SecretStore` permite trocar depois.
- **`pgcrypto` no banco**: a chave passaria pelas queries e poderia aparecer em logs de statement.
- **Valor em texto puro com RLS**: RLS protege de outro tenant, não de backup, dump ou acesso de operador.

## Follow-up

- Backend de KMS ou secret manager no M09, mantendo a mesma interface.
- Re-selagem em lote para aposentar chaves antigas.
