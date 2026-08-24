# REST

Use recursos e verbos HTTP coerentes. `GET` sem side effects, `POST` para comandos/criação, `PUT/PATCH` conforme semântica, `DELETE` idempotente quando possível. Não retornar `200` para falhas de domínio.
