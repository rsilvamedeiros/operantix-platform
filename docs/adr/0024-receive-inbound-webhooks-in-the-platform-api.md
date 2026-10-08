# ADR-0024 — Receive inbound webhooks in the platform API

**Status:** Accepted  
**Date:** 2026-10-08

## Context

O M05 pede webhooks de entrada: um sistema externo inicia um workflow com um POST. Esse POST não tem token do Identity Provider, então a autenticação precisa vir de um secret compartilhado. `docs/security/webhook-security.md` exige assinatura, janela de replay e idempotência. A ADR-0022 diz que o `platform-api` só sela secrets; verificar uma assinatura de entrada exige abrir o secret em algum lugar que receba HTTP. O integration worker não tem ingress HTTP, e criar um serviço novo só para isso iria contra `.claude/rules/architecture.md`.

## Decision

- **Recurso**: `inbound_webhooks` (dono: módulo de integrações do `platform-api`) liga um workflow a um signing secret próprio (`secrets.kind = 'WEBHOOK_INBOUND'`). Apagar o workflow apaga o webhook. O secret aparece só na criação e na rotação.
- **Rota pública**: `POST /hooks/v1/{organizationId}/{inboundWebhookId}`, fora de `/api/v1` e sem JWT. O `organizationId` no caminho deixa a busca rodar sob a RLS do tenant, sem papel com acesso entre tenants.
- **Assinatura**: o mesmo esquema da saída (ADR-0023): `Operantix-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<corpo cru>")>`, comparada em tempo constante sobre o corpo exatamente como chegou. Timestamp fora de ±5 minutos é recusado.
- **Idempotência**: `Idempotency-Key` é obrigatório e vira a chave idempotente da execução, prefixada pelo webhook (`inbound:<id>:<chave>`). A mesma chave com o mesmo corpo devolve a mesma execução; com outro corpo, `409 IDEMPOTENCY_KEY_REUSED`. Junto com a janela de 5 minutos, um replay capturado não cria uma segunda execução.
- **Corpo**: `application/json`, um objeto, até 100 KiB; vira o `input` da execução. A execução registra `triggerType: 'webhook'` e o id do webhook no evento `execution.created`.
- **Respostas**: `202` com a execução nova, `200` num replay. Assinatura ausente, inválida ou fora da janela dá `401 WEBHOOK_SIGNATURE_INVALID`, sem dizer qual. Organização ou webhook desconhecido dá `404`.
- **Secrets**: o `platform-api` passa a abrir secrets `WEBHOOK_INBOUND`, e só esses. Isso amplia a ADR-0022, que dizia que a API só sela; o resto dela continua valendo.

## Consequences

- O processo da API agora guarda o keyring para decifrar, não só para cifrar. Um vazamento de memória da API expõe secrets de entrada, como já expõe os da saída no worker.
- A rota pública consome banco antes de verificar a assinatura (busca do webhook). Sem rate limit, um atacante pode gerar carga com ids aleatórios. Rate limit por IP e por webhook fica para o M08.
- Rotação é imediata, como na saída: o remetente precisa trocar o secret junto.

## Alternatives considered

- **Receber no integration worker**: manteria o decifrar fora da API, mas daria ingress HTTP público a um worker que hoje só consome filas.
- **Serviço de ingestão próprio**: isolamento melhor, mas é um deployable novo para uma rota.
- **Token no caminho ou num header, sem HMAC**: mais simples para quem envia, mas não protege o corpo nem impede replay.
- **Buscar o webhook só pelo id, sem organização no caminho**: exigiria um papel ou função que lê entre tenants.

## Follow-up

- Rate limit da rota pública (M08).
- Assinatura dupla durante a rotação, se algum remetente precisar.
