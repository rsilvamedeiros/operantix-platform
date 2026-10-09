# secrets

Cria os **contêineres** do Secrets Manager que os workloads leem (ADR-0037). Os valores nunca passam pelo Terraform: ficam fora do código e do estado.

| Secret (sob `name_prefix`) | Quem lê | Variável |
| --- | --- | --- |
| `database/platform-api` | platform-api | `DATABASE_USER` / `DATABASE_PASSWORD` |
| `database/workflow-worker` | workflow-worker | `WORKER_DATABASE_USER` / `WORKER_DATABASE_PASSWORD` |
| `database/workflow-relay` | outbox relay | `RELAY_DATABASE_USER` / `RELAY_DATABASE_PASSWORD` |
| `database/integration-worker` | integration-worker | `INTEGRATION_DATABASE_USER` / `INTEGRATION_DATABASE_PASSWORD` |
| `ai-service/token` | workloads e ai-service | `AI_SERVICE_TOKEN` |
| `ai-service/anthropic-api-key` | ai-service | chave do provedor de LLM |
| `platform/secrets-encryption-keys` | workloads que abrem secrets selados | `SECRETS_ENCRYPTION_KEYS` |

Os logins de banco são JSON `{"username": "...", "password": "..."}`; o ECS injeta cada chave por ARN.

## Gravar um valor

```bash
aws secretsmanager put-secret-value \
  --secret-id operantix/dev/ai-service/token \
  --secret-string "$(openssl rand -base64 48)"
```

Rotacionar é gravar uma nova versão e reiniciar os serviços que a leem. A chave `platform/secrets-encryption-keys` segue as regras de rotação do keyring (`packages/secrets`): inclua a chave nova sem remover as antigas até reencriptar.
