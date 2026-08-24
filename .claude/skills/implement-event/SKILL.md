---
name: implement-event
description: Design or implement an Operantix event/command contract, Kafka producer/consumer behavior, or schema evolution.
---

# Implement Event

For `$ARGUMENTS`:
1. Decide whether it is event or command.
2. Define producer, consumers and business reason.
3. Use standard envelope and version.
4. Define partition key/order needs.
5. Define idempotency behavior.
6. Define retry/DLQ behavior.
7. Propagate trace/correlation context.
8. Add contract tests.
9. Update event catalog.
