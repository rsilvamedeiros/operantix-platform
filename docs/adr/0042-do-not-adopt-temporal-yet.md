# ADR-0042 — Do not adopt Temporal yet

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O ADR-0015 pedia um spike de Temporal quando workflows duráveis e longos virassem gargalo de complexidade. O engine próprio (ADR-0018) hoje roda definições **lineares** de até 50 steps (`http_request`, `delay` de até 24 h, `ai_classify`, `log`), com fila em PostgreSQL, leases, retentativas, timeline append-only e eventos via outbox. Ramificação e mais tipos de step estão no roadmap.

## Decision

**Não adotar Temporal agora.** Registrar o que o spike mostrou e as condições que reabrem a decisão.

O spike (`tests/spikes/temporal`, Temporal 1.28.1 sobre PostgreSQL, worker Python) executa uma definição do Operantix por meio de um único workflow genérico que interpreta um plano gerado da definição (`plan.py`, cerca de 40 linhas de tradução e ~20 do workflow). Resultados em uma máquina de 4 vCPU:

| Cenário | Resultado |
| --- | --- |
| 200 workflows de 3 activities, um worker | 23,4 workflows/s (8,5 s) |
| Step HTTP que falha duas vezes e depois responde | 3 chamadas, 6,1 s com backoff de 2 s e 4 s, sem código de retentativa nosso |
| Worker encerrado durante um timer de 6 s e substituído | Workflow terminou os 3 steps; o timer não se perdeu |

Referência do engine atual (`docs/testing/load.md`, mesma classe de máquina, 3 steps triviais): cerca de 38 execuções/s com um worker. Não são medidas comparáveis: linguagens, processos e perfis diferentes, e o spike não grava timeline nem outbox. A leitura honesta é **mesma ordem de grandeza**, nenhuma vantagem de vazão.

O que Temporal entregaria de graça: timers duráveis, retentativas com backoff, retomada após falha de worker e histórico de execução. O engine atual já entrega retentativa, retomada por lease e timers de até 24 h; o ganho de código é real (o `ExecutionRunner` tem ~480 linhas e a fila ~100), mas boa parte dele é regra do Operantix que **não** desaparece: tenant isolation por RLS, timeline que o cliente lê pela API, eventos `execution.*` no outbox, política SSRF e conexões. Com Temporal, tudo isso passaria a morar dentro de activities e de um segundo armazenamento de histórico.

Custos de adoção que o spike não mede, mas pesam: operar um cluster Temporal (quatro serviços e seu próprio banco e visibilidade) ou pagar o Cloud, um novo modelo mental (código determinístico, versionamento de workflows em voo), e uma segunda fonte de verdade do estado da execução ao lado do PostgreSQL (ADR-0003).

## Consequences

- O contrato de definição continua sendo a fonte de verdade. O interpretador genérico do spike mostra que uma migração futura não precisa mudar a API pública: cada definição vira um plano.
- **Reabrir a decisão** (propostas) quando a definição ganhar pelo menos dois destes: ramificação e laços, espera por aprovação humana ou sinal externo, esperas de dias, compensação (saga), ou quando a manutenção do `ExecutionRunner` passar a ser o gargalo de entrega.
- Antes de uma adoção real, repetir o spike com worker TypeScript, com timeline e outbox como activities, e com um plano de operação (Cloud ou cluster próprio) e de isolamento por tenant (namespace por tenant ou atributo de busca).

## Alternatives

- **Adotar já:** troca complexidade conhecida por uma plataforma nova sem que o produto precise de ramificação ou esperas longas.
- **Estender o engine próprio para ramificação:** é o caminho natural enquanto as definições forem simples; o custo cresce com laços e sinais.
- **Outros orquestradores (Step Functions, Argo, Airflow):** não foram avaliados; Step Functions prende o modelo à AWS e o ADR-0036 evita acoplamento além do necessário.

## Follow-up

Medir o custo de manutenção do engine (tempo por mudança em `ExecutionRunner`) quando ramificação chegar; esse é o dado que decide.
