# Event Ordering

Kafka garante ordering por partition, não globalmente.

## Operantix direction

Eventos que representam lifecycle de uma mesma Execution devem usar partition key consistente (`executionId`) quando ordering for necessário.

Consumers ainda devem validar state transition; ordering de transporte não substitui invariantes. Eventos atrasados/duplicados precisam ser tratados de forma segura.
