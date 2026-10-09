# Vector Search

## Initial direction

Decidido no ADR-0044: PostgreSQL + pgvector, com RLS como o resto do esquema, busca exata dentro do tenant primeiro e índice aproximado (HNSW) só depois de medido.

## Data model concerns

- embedding model/version;
- source document/version;
- chunk strategy;
- tenant isolation;
- re-embedding strategy;
- metadata filters.

## Future

Dedicated vector DB apenas se escala/latência/features justificarem.
