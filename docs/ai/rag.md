# RAG

Pipeline: ingest → normalize → chunk → embed → index → retrieve → rerank opcional → generate. Todo chunk deve carregar tenant, source, version e provenance. Avaliar retrieval separadamente da geração.

## Armazenamento e busca

Decidido no ADR-0044: embeddings em PostgreSQL com pgvector sob RLS, busca exata dentro do tenant primeiro; HNSW só para tenants grandes e com varredura iterativa. Medir recall da recuperação, não só latência. Benchmark em `tests/benchmarks/retrieval`.
