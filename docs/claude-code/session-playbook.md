# Session Playbook

## Start
1. `git status` e diff atual.
2. Leia módulo ativo.
3. Leia ADRs relacionados.
4. Rode testes baseline relevantes.

## Build
- Um incremento vertical por vez.
- Não criar abstrações para fases futuras.
- Commit-ready state com frequência.

## Review
- correctness;
- boundary/data ownership;
- tenancy/security;
- failure modes/idempotency;
- tests;
- observability;
- docs.

## Handoff
No final, registrar: implementado, não implementado, decisões, riscos, comandos de teste e próximo passo recomendado.
