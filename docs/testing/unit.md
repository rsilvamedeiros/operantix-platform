# Unit Tests

Cobrir invariantes e state transitions sem Nest app/database quando possível. Teste comportamento, não implementação privada.

Unit tests são o ciclo rápido do TDD: devem rodar em segundos, sem I/O, com relógio e UUIDs injetados. Regras de domínio ficam fora de controllers justamente para serem testáveis assim. Ver `docs/development/tdd.md`.
