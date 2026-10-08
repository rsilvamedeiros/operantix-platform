# Retry & DLQ

## Retry classes

- immediate limited retry para glitches curtos;
- delayed/exponential retry para throttling/temporários;
- no retry para validation/auth/domain errors.

## DLQ

Mensagem que esgota política deve preservar event metadata, erro categorizado e número de tentativas. Re-drive precisa ser explícito e auditável.

## Poison messages

Schema incompatível ou payload inválido não deve bloquear partition indefinidamente.

## Implemented state

`KafkaEventConsumer` em `@operantix/messaging` implementa a política para qualquer consumer:

- Mensagem que não passa em `parseEvent` (JSON inválido, envelope ou versão desconhecidos) vai direto para a DLQ com `dlq-reason: CONTRACT_VIOLATION`; a partição segue.
- Handler que lança `PermanentError(code)` vai direto para a DLQ com `HANDLER_REJECTED`.
- Qualquer outro erro é retentado: o evento é republicado no retry topic com `retry-attempt`, `retry-not-before` (epoch ms) e a origem (`source-topic`, `source-partition`, `source-offset`), e o offset original é commitado. O atraso é `baseDelayMs × 2^(tentativa-1)`, limitado a `maxDelayMs` (no máximo 120 s, para a espera caber em `max.poll.interval.ms`).
- Um segundo consumer group (`<groupId>.retry`) consome o retry topic, espera o `retry-not-before` e chama o mesmo handler. Esgotado `maxAttempts`, o evento vai para a DLQ com `RETRIES_EXHAUSTED`.
- A mensagem na DLQ mantém valor, chave e headers originais (sem os de retry) e acrescenta `dlq-reason`, `dlq-error-code` (código ou nome do erro, nunca a mensagem), `dlq-attempts`, `dlq-source-topic`, `dlq-source-partition`, `dlq-source-offset` e `dlq-at`.
- Offsets só são commitados depois que o handler terminou ou o evento foi encaminhado. Parar o consumer durante uma espera não commita o retry, que volta no restart.

Convenção de tópicos: cada consumer group tem `<groupId>.retry` e `<groupId>.dlq`, criados em `infrastructure/docker/kafka/create-topics.sh` junto com o consumer que os usa. O primeiro consumer real chega no M05 (integration worker).

Ainda não implementado: re-drive da DLQ (ferramenta explícita e auditada) e métricas de retry/DLQ (M07).
