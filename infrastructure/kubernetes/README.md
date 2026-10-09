# Kubernetes

Status: **avaliado, não adotado** (ADR-0043). O ambiente de nuvem roda em ECS/Fargate (ADR-0038). O que existe aqui é um spike para dar base à decisão; nada disto é implantado.

## spike/

Manifests dos workloads (`ai-service`, `platform-api` e a tarefa de migração) mais stand-ins locais de Postgres e Redis.

| Arquivo | Para quê |
| --- | --- |
| `manifests/` | Namespaces (Pod Security `restricted` para os workloads), Deployments, Services, PodDisruptionBudgets, NetworkPolicy e o Job de migração |
| `test_manifests.py` | Política de endurecimento: não-root, raiz somente leitura, sem segredos inline, imagens fixadas, probes, PDB. Espelha o que o módulo `ecs-service` garante. |
| `validate.sh` | Sobe um k3s em Docker e valida os manifests contra um API server real (`--dry-run=server`), incluindo o Pod Security Admission, com controles negativos |

```bash
cd infrastructure/kubernetes/spike
uv run --with pyyaml --with pytest pytest
./validate.sh          # precisa de Docker; não executa pods
```

## Limites

Os pods **não chegaram a rodar** no ambiente do spike: o runc aninhado dentro do k3s falhou ao criar o sandbox. Probes, rollout, PDB e NetworkPolicy estão escritos e conferidos contra o schema e a política, mas não foram exercitados em execução.
