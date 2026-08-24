# Distributed Tracing

Trace deve sobreviver HTTP → Kafka → worker → AI/integration call. Criar links quando causalidade assíncrona não for parent-child direta. Execution ID aparece como attribute pesquisável, respeitando cardinalidade do backend.
