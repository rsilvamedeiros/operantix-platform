# Communication Patterns

## Synchronous

REST é padrão inicial para client→API e chamadas simples onde o caller precisa de resposta imediata. gRPC pode ser adotado mais tarde para comunicação interna de alta frequência/contratos Protobuf, mediante ADR.

## Asynchronous

Kafka para fatos de domínio e comandos assíncronos de execução quando o módulo de eventing for ativado.

## Selection rule

Use síncrono quando a operação precisa de resposta imediata e a dependência é aceitável. Use assíncrono quando desacoplamento temporal, buffering, fan-out ou independent scaling traz benefício.

## Timeouts

Toda chamada síncrona externa deve ter timeout explícito. Timeout não significa automaticamente retry seguro.
