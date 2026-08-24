# Rate Limiting

Aplicar limites por tipo de principal e custo da operação. Um workflow trigger pode custar muito mais que um GET.

## Dimensions

- API key/user;
- tenant/workspace;
- endpoint class;
- external provider quota.

Redis pode armazenar counters distribuídos. Resposta 429 deve incluir informação útil sem revelar política interna sensível.
