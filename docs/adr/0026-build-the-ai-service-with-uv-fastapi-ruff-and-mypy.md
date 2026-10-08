# ADR-0026 — Build the AI service with uv, FastAPI, ruff and mypy

**Status:** Accepted  
**Date:** 2026-10-08

## Context

O M06 inicializa o `services/ai-service`, primeiro workload Python do monorepo (ADR-0005). `docs/development/python.md` deixa lint, format e tooling para este módulo. O resto do repositório usa pnpm, Turbo, TypeScript strict, ESLint e Vitest, e a CI roda tudo num job só. O serviço precisa das mesmas garantias: dependências travadas, checagem de tipos estrita, lint, testes com cobertura mínima e nenhuma chamada real a provider de LLM nos testes.

## Decision

- **Python 3.13**, a versão estável que o ambiente de desenvolvimento e o runner já têm.
- **uv** gerencia o projeto: `pyproject.toml` e `uv.lock` versionados, `uv sync --locked` na CI. Ele substitui pip, venv e pip-tools com um lockfile multiplataforma.
- **FastAPI + Pydantic v2** na borda HTTP (ADR-0005). **pydantic-settings** lê e valida o ambiente na inicialização, como o `config.ts` dos workloads Node; um erro nomeia a variável, nunca o valor.
- **uvicorn** serve a aplicação.
- **ruff** faz lint e format, cumprindo o papel de ESLint e Prettier. **mypy `--strict`** cumpre o papel do `tsc` strict, e `Any` explícito é proibido como atalho, como `any` no TypeScript.
- **pytest + pytest-cov**, com cobertura mínima de 80% de linhas e branches, igual aos pacotes TS. Os testes usam o `TestClient` do FastAPI (httpx) e providers fake; nenhum teste chama um provider real.
- **Layout `src/`** (`src/ai_service`), para os testes rodarem contra o pacote instalado, não contra o diretório.
- **CI**: um job `python` separado do job TypeScript, com `uv sync --locked`, `ruff check`, `ruff format --check`, `mypy` e `pytest --cov`.

## Consequences

- O monorepo passa a ter dois gerenciadores de dependência (pnpm e uv). O Turbo não orquestra o Python; o job de CI e o README do serviço documentam os comandos.
- Atualizar uma dependência Python exige regenerar `uv.lock` com `uv lock`.
- mypy strict pode exigir stubs ou `cast` explícito em bibliotecas sem tipos. Cada `type: ignore` precisa de justificativa no código.

## Alternatives considered

- **Poetry**: maduro, mas mais lento e com um lockfile próprio; o uv cobre o mesmo com menos peças.
- **pip + requirements.txt**: sem lockfile de transitivas por plataforma.
- **black + flake8 + isort**: três ferramentas onde o ruff basta.
- **pyright**: bom, mas o mypy é o padrão das bibliotecas que vamos usar (Pydantic tem plugin para ele).

## Follow-up

- Imagem de container do serviço junto com o deploy (M09).
- OpenTelemetry no serviço (M07).
