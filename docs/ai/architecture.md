# AI Architecture

AI Service é boundary Python separado para capabilities que se beneficiam do ecossistema Python. O Platform/Workflow layer envia inputs estruturados e recebe output validado. O serviço não deve receber acesso irrestrito ao banco transacional.

## Layers
API/consumer → capability handler → provider gateway/agent runtime → model/provider. Telemetry e guardrails atravessam todas as camadas.
