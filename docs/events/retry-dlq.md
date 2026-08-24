# Retry & DLQ

## Retry classes

- immediate limited retry para glitches curtos;
- delayed/exponential retry para throttling/temporários;
- no retry para validation/auth/domain errors.

## DLQ

Mensagem que esgota política deve preservar event metadata, erro categorizado e número de tentativas. Re-drive precisa ser explícito e auditável.

## Poison messages

Schema incompatível ou payload inválido não deve bloquear partition indefinidamente.
