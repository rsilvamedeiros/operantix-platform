# Module Execution Protocol

## One module at a time

Cada módulo é uma unidade de decisão, implementação e validação. Não antecipe deliverables do próximo módulo para "economizar tempo".

## Per-module artifact set

- plano de implementação;
- código/configuração;
- migrations/contracts quando aplicável;
- testes;
- telemetria;
- documentação atualizada;
- resumo final de diferenças entre planejado e entregue.

## Stop conditions

Pare e registre decisão antes de continuar se surgir:
- nova tecnologia fundamental;
- novo deployable service;
- mudança de ownership de dados;
- breaking API/event contract;
- alteração de tenancy/security model;
- dependência operacional fora do roadmap.

Esses casos normalmente exigem ADR.
