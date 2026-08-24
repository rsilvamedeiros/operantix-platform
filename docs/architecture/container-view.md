# Container View

## Web
Next.js app. Não deve ser owner de regra de negócio crítica. Consome Platform API.

## Platform API
NestJS. Owner dos comandos de domínio transacionais, authorization context e APIs.

## Workflow Worker
Consumer especializado em execução assíncrona e coordenação de steps.

## Integration Worker
Consumer especializado em chamadas de terceiros, syncs e callbacks.

## AI Service
Python/FastAPI. Executa capabilities de IA; não deve conhecer detalhes desnecessários do domínio transacional.

## Kafka
Backbone de eventing quando ativado no roadmap.

## PostgreSQL
Source of truth. Ownership de schema/tabelas deve ser explícito.

## Redis
Coordenação efêmera. Perda de cache não pode destruir estado de negócio.
