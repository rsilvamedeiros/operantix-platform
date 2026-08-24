# Data Retention

Definir retenção por categoria, não indefinidamente por default.

| Categoria | Direção inicial |
|---|---|
| Core business state | enquanto necessário ao produto/contrato |
| Execution detailed logs | retenção configurável |
| Raw external payload | mínima necessária |
| Audit | maior retenção, conforme requisitos |
| AI prompts/responses | minimização e redaction; opt-in quando sensível |
| Metrics/traces | retenção do backend de observabilidade |

Requisitos legais/contratuais futuros substituem defaults técnicos.
