---
name: implement-worker
description: Implement an asynchronous Operantix worker/consumer with idempotency, retries, shutdown and telemetry.
---

# Implement Worker

- Consumer must tolerate duplicate delivery.
- Validate contract before business logic.
- Classify retryable vs permanent errors.
- Bound concurrency and retries.
- Support graceful shutdown.
- Record execution/attempt state before external side effects where required.
- Add structured logs, metrics and traces.
- Test duplicate delivery, transient failure and poison message behavior.
