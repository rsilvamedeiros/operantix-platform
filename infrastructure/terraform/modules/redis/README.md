# redis

ElastiCache Redis para cache e readiness (ADR-0037). Redis nunca é fonte de verdade (ADR-0012).

- Criptografado em repouso. Com mais de um nó, failover automático e Multi-AZ.
- **TLS em trânsito desligado por padrão**: o cliente Redis da `platform-api` ainda não fala TLS nem AUTH (`apps/platform-api/src/infrastructure/redis.ts`). A proteção atual é de rede (security group do módulo `network` só admite os workloads). Ligue `transit_encryption_enabled` quando o cliente suportar.
- Sem snapshots por padrão.
