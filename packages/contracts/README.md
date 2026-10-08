# Contracts Package

Contratos interoperáveis/versionados. Não incluir ORM/domain internals.

## Eventos

- `createEvent(type, data, meta)` monta o envelope na versão atual do evento e valida envelope e `data`.
- `parseEvent(raw)` valida input não confiável (mensagem consumida). Tipo ou versão desconhecidos lançam `EventContractError('UNKNOWN_EVENT')`; campos extras são descartados, para o consumer tolerar campos opcionais novos.
- `partitionKey(event)` devolve o `executionId`, a chave que mantém a ordem dos eventos de uma execução.
- Erros de contrato nomeiam os campos inválidos, nunca os valores.

Definições ficam em `src/events/*-events.ts`, chaveadas por `tipo@versão`. Uma mudança incompatível cria uma nova versão ao lado da anterior (`docs/events/schema-evolution.md`).

## JSON Schema

`schemas/events/<tipo>.v<versão>.json` é gerado a partir dos schemas zod, para consumers que não importam TypeScript (o `ai-service` em Python). Um teste falha quando o arquivo commitado diverge do contrato. Para regenerar:

```bash
pnpm --filter @operantix/contracts build
pnpm --filter @operantix/contracts schemas:generate
```

## Consumo

O pacote exporta `src/index.ts` como tipos e `dist/index.js` em runtime, então os apps fazem typecheck sem build prévio, mas precisam do build para executar.
