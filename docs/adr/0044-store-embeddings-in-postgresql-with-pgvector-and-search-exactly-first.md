# ADR-0044 — Store embeddings in PostgreSQL with pgvector and search exactly first

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O RAG (docs/ai/rag.md) pede chunks com tenant, source, version e provenance, indexados para recuperação. A pergunta do M10 é onde guardar os vetores: um banco vetorial dedicado ou `pgvector` no PostgreSQL que já é a fonte de verdade (ADR-0003), com RLS por organização (ADR-0007/0017). Um terceiro armazenamento teria de repetir o isolamento por tenant, o backup e a operação (ADR-0037).

Ainda não há embeddings reais nem provedor de embeddings escolhido; este ADR decide o armazenamento e o modo de busca, não a feature.

## Decision

**Guardar embeddings em PostgreSQL com `pgvector`, sob a mesma RLS das demais tabelas, e começar com busca exata dentro do tenant.** Índice aproximado (HNSW) só entra quando um tenant crescer o bastante para a busca exata estourar o orçamento de latência, e só com varredura iterativa.

Evidência (`tests/benchmarks/retrieval`, pgvector 0.8.7, PostgreSQL 17, 60 mil vetores de 384 dimensões em 30 tenants de 106 a ~7 mil vetores, 300 consultas, RLS ativa, gabarito exato calculado em numpy):

| Variante | Recall@10 | Consultas com menos resultados | p50 / p99 |
| --- | --- | --- | --- |
| Exata (btree em `organization_id`, ordenação por distância) | 1,00 | 0/300 | 1,5 ms / 5,8 ms |
| HNSW padrão (`ef_search=40`) com btree presente | 0,94 | 8/300 | 1,7 ms / 4,1 ms |
| Só HNSW, padrão | 0,56 | 120/300 | 1,6 ms / 3,6 ms |
| Só HNSW, `ef_search=200` | 0,77 | 55/300 | 2,5 ms / 4,7 ms |
| Só HNSW, `iterative_scan=relaxed_order` | 0,85 | 0/300 | 2,3 ms / 27 ms |
| Só HNSW, `iterative_scan=strict_order` | 0,73 | 7/300 | 2,5 ms / 106 ms |

O que isto mostra:

- **Filtro de tenant e índice aproximado brigam.** O HNSW é global; a RLS filtra depois da busca no grafo. Para um tenant pequeno em meio a muitos, a maior parte dos candidatos pertence a outros tenants e some, o que devolve poucos resultados ou resultados piores, **sem erro nenhum**. Pior: com o btree presente, o planner escolhe o HNSW para alguns tenants e o btree para outros, e o recall cai para 0,94 de forma silenciosa.
- A busca exata dentro do tenant (o btree em `organization_id` já existe como padrão do esquema) deu recall 1,00 com p99 de ~6 ms para tenants de até ~7 mil vetores. Para essa escala, o índice aproximado não traz ganho e traz risco.
- A varredura iterativa (`hnsw.iterative_scan`) elimina as consultas incompletas, mas não recupera o recall do caso exato e tem cauda longa (p99 de 27 a 106 ms).

O que **não** foi medido: tenants com centenas de milhares de vetores (onde a busca exata deixa de caber no orçamento e o HNSW passa a compensar), embeddings reais de texto, concorrência alta, e a versão de pgvector que o RDS oferece (verificar antes de adotar).

## Consequences

- Quando a feature existir: tabela `knowledge_chunks` (organização, fonte, versão, proveniência, embedding) com RLS e btree em `organization_id`, como no benchmark; nenhum acesso ao banco pelo `ai-service` (ele não tem credencial de banco): a recuperação fica atrás de uma API do platform-api, que é dono do domínio transacional.
- **Medir recall em produção**, não só latência: o harness de avaliação (docs/ai/evaluation.md) passa a ter casos de recuperação com gabarito. Um índice aproximado sem essa medição falha em silêncio.
- Regra proposta para adotar HNSW: apenas para tenants acima de um limiar medido em dados reais (hipótese de partida: dezenas de milhares de vetores, quando a busca exata passar de ~50 ms), por índice parcial ou partição por tenant, com `iterative_scan` e `max_scan_tuples` explícitos, e comparação de recall contra a busca exata antes e depois.
- Falta decidir o provedor de embeddings e como o gateway (ADR-0027) o expõe.

## Alternatives

- **Banco vetorial dedicado (Qdrant, Pinecone, OpenSearch):** melhor para bilhões de vetores e filtros ricos; custo é um segundo sistema para isolar por tenant, operar e proteger, sem requisito de escala que o justifique.
- **HNSW global desde o início:** o desempenho médio parece bom e a perda de qualidade é silenciosa, como mostram as linhas acima.
- **Um índice por tenant:** correto para poucos tenants grandes; inviável para muitos pequenos.

## Follow-up

Repetir o benchmark com embeddings reais de documentos de teste e com um tenant grande antes de definir o limiar; escolher o provedor de embeddings.
