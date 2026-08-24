# Data Architecture

## Principle

Polyglot persistence é permitido, mas cada store precisa de justificativa e ownership explícito.

## Initial stores

- PostgreSQL: transacional.
- Redis: efêmero/coordenação.

## Conditional stores

- MongoDB: documentos/payloads flexíveis.
- pgvector: embeddings no PostgreSQL.
- DynamoDB: high-volume event access pattern futuro.
- Object Storage: arquivos/exports/document artifacts.

## Rule

Não duplicar dado sem definir source of truth, consistência esperada e estratégia de rebuild.
