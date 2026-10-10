# Getting Started

Passo a passo para sair de um clone limpo e ter o Operantix rodando na sua máquina. Cada comando foi executado em uma cópia nova do repositório.

## 1. Pré-requisitos

| Ferramenta | Versão | Para quê |
| --- | --- | --- |
| Node.js | 22 (`.nvmrc`; `nvm use`) | apps e pacotes TypeScript |
| pnpm | 10 (`packageManager`; `corepack enable`) | workspaces |
| Docker + Compose | recente | PostgreSQL, Redis e Kafka locais; Testcontainers nos testes de integração. Opcional para rodar o app: veja "Sem Docker" no passo 4 |
| [uv](https://docs.astral.sh/uv/) | recente | só para o `services/ai-service` (instala o Python 3.13 sozinho) |

## 2. Instalar e verificar

```bash
git clone https://github.com/rsilvamedeiros/operantix-platform.git
cd operantix-platform
pnpm install --frozen-lockfile
pnpm build
pnpm test            # testes unitários, sem infraestrutura
```

Os mesmos gates do CI, em um comando por vez: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm build && pnpm test`. Os testes de integração (`pnpm test:integration`) sobem seus próprios containers e só precisam do Docker rodando.

## 3. Configurar o ambiente

```bash
cp .env.example .env
```

Edite o `.env`:

1. Troque `change-me-local-only` por `operantix-local` em todas as senhas. É a senha que o `compose.yaml` define para o PostgreSQL e que os scripts de `infrastructure/docker/postgres/init` usam para criar os papéis `operantix_app`, `operantix_worker`, `operantix_relay` e `operantix_integration`.
2. Gere a chave de cifra de secrets e cole em `SECRETS_ENCRYPTION_KEYS`:

   ```bash
   echo "k1:$(openssl rand -base64 32)"
   ```

3. Para o AI service, gere um token e cole em `AI_SERVICE_TOKEN` (mínimo de 32 caracteres):

   ```bash
   openssl rand -base64 32
   ```

   Sem `AI_SERVICE_URL`, os passos `ai_classify` falham como "não configurados"; o resto funciona.

4. `AUTH_ISSUER`, `AUTH_AUDIENCE` e `AUTH_JWKS_URI` apontam para um provedor OIDC. Os placeholders bastam para subir a API e ver `/health`; para chamar `/api/v1` você precisa de tokens de um provedor real.

O `.env` está no `.gitignore`. Nunca commite segredos (`SECURITY.md`).

Carregue o arquivo no shell em que for rodar os apps:

```bash
set -a && . ./.env && set +a
```

## 4. Subir a infraestrutura local

```bash
docker compose up -d postgres redis                 # suficiente para a API e o workflow worker
docker compose up -d postgres redis kafka kafka-init  # com eventos (relay e integration worker)
docker compose --profile observability up -d        # opcional: collector, Tempo, Prometheus, Grafana
```

Se o volume do PostgreSQL é anterior aos scripts de papéis, recrie: `docker compose down -v && docker compose up -d`.

### Sem Docker

A API, o workflow worker e o web só precisam de um PostgreSQL e um Redis acessíveis; o Docker é uma conveniência. Validado em Linux com PostgreSQL 16 e Redis (o compose usa o PostgreSQL 17, e as migrations rodam nos dois). No macOS use `brew install postgresql@17 redis`; no Windows, WSL2 com os pacotes do Linux (não validado).

1. Suba os dois serviços na máquina (porta 5432 e 6379) e crie o superusuário e o banco com a senha do `.env`:

   ```bash
   # superusuário "operantix" com a senha operantix-local, como no compose
   createdb -h localhost -U operantix operantix
   ```

   Em uma instalação nova do Linux, `initdb -U operantix --auth=md5 --pwfile=<arquivo com a senha>` cria o cluster com esse usuário.

2. Crie os papéis de aplicação, que no Docker um script faz na primeira inicialização. Rode uma vez, da raiz do repositório:

   ```bash
   export PGPASSWORD=operantix-local
   cd infrastructure/docker/postgres
   for r in app worker relay integration; do
     psql -h localhost -U operantix -d operantix -v ON_ERROR_STOP=1 -v ${r}_password=operantix-local -f $r-role.sql
   done
   cd -
   ```

3. Siga o passo 5 normalmente (`db:migrate` e os `start`).

Limites sem Docker: o relay e o integration worker precisam de um Kafka (instale um broker na porta 9092 e crie os tópicos de `infrastructure/docker/kafka/create-topics.sh`; não validado), e `pnpm test:integration` usa Testcontainers, então exige Docker. Os testes unitários (`pnpm test`) não precisam.

## 5. Aplicar o schema e subir os serviços

Cada comando em um terminal próprio, com o `.env` carregado.

```bash
pnpm --filter @operantix/platform-api db:migrate     # uma vez, e a cada migration nova
pnpm --filter @operantix/platform-api start          # http://localhost:3000
pnpm --filter @operantix/workflow-worker start       # executa as execuções
pnpm --filter @operantix/workflow-worker start:relay # outbox -> Kafka (precisa do Kafka)
pnpm --filter @operantix/integration-worker start    # webhooks (precisa do Kafka)
(cd services/ai-service && uv sync && uv run ai-service)   # http://localhost:8000
pnpm --filter @operantix/web dev                     # http://localhost:3001
```

Confira:

```bash
curl localhost:3000/health/live     # {"status":"ok"}
curl localhost:3000/health/ready    # postgres e redis "up"
```

A página inicial do web (`http://localhost:3001`) mostra o estado da API; sem a API no ar ela mostra "Unreachable". A URL da API vem de `API_BASE_URL` (padrão `http://localhost:3000`) e `/design` mostra os tokens e componentes.

Detalhes e variáveis de cada app: o README dele (`apps/*/README.md`, `services/ai-service/README.md`).

## 6. Fluxo de trabalho do dia a dia

- Branch curta a partir de `main` (`feat/…`, `fix/…`, `docs/…`); commits em Conventional Commits; teste antes do código (`docs/development/tdd.md`, `process.md`).
- Antes de abrir o PR: format, lint, typecheck, build e os testes do que você tocou (`docs/testing/quality-gates.md`).
- Mudou o contrato da API: `pnpm --filter @operantix/platform-api build && pnpm --filter @operantix/platform-api openapi:generate` e commite o diff.

## 7. Problemas comuns

| Sintoma | Causa e saída |
| --- | --- |
| `Invalid environment configuration: <VAR>` | A validação nomeia a variável (nunca o valor). Confira o `.env` carregado no shell atual. |
| `password authentication failed` | O volume do PostgreSQL foi criado com outras senhas: `docker compose down -v && docker compose up -d`. |
| `/health/ready` em 503 logo após subir | O Redis reconecta em segundo plano; tente de novo em alguns segundos. |
| Worker de integração/relay com `Connection refused` em `localhost:9092` | Suba o Kafka: `docker compose up -d kafka kafka-init`. |
| `uv` com erro de certificado atrás de proxy | `export UV_SYSTEM_CERTS=1` |
| Testes de integração não acham o Docker | Eles exigem Docker. Inicie o daemon; em ambientes sem Ryuk, `TESTCONTAINERS_RYUK_DISABLED=true`. |
