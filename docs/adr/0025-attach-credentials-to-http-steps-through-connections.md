# ADR-0025 — Attach credentials to HTTP steps through connections

**Status:** Accepted  
**Date:** 2026-10-08

## Context

O passo `http_request` não aceita headers de credencial: a definição do workflow é texto puro e todo papel do tenant pode lê-la. Para chamar APIs autenticadas, o M05 prevê um registro de connections com referências a secrets. Duas coisas precisam ser verdade ao mesmo tempo: quem escreve workflows (DEVELOPER) não vê a credencial, e uma credencial não pode ser mandada para um destino que o dono dela não aprovou. Se não houvesse essa amarração, quem edita um workflow poderia apontar o passo para um servidor próprio e capturar o token.

## Decision

- **Recurso**: `connections` (dono: módulo de integrações do `platform-api`) tem `name` (único na organização), `base_url` e a forma de autenticação: `bearer` (envia `Authorization: Bearer <segredo>`) ou `header` (envia `<header_name>: <segredo>`). O valor fica em `secrets` com `kind = 'CONNECTION_CREDENTIAL'` (ADR-0022) e nunca volta pela API. Trocar a credencial é um `PUT` que sela um secret novo e apaga o antigo.
- **Destino amarrado**: a credencial só é enviada quando a URL do passo fica dentro de `base_url`: mesmo esquema, mesmo host e mesma porta, e caminho igual ou abaixo do caminho base, sem `..`. O worker confere isso em toda execução; a API confere ao publicar uma versão, para o erro aparecer cedo.
- **Uso**: o passo ganha `connectionId` opcional. O workflow worker lê a connection e o secret da mesma organização da execução, decifra e injeta o header. Headers de credencial escritos à mão continuam proibidos, e o header injetado substitui qualquer outro com o mesmo nome.
- **Acesso do worker**: o papel `operantix_worker` ganha `SELECT` em `connections` e só nos secrets `CONNECTION_CREDENTIAL`, por policy. O worker passa a receber `SECRETS_ENCRYPTION_KEYS`.
- **Sigilo**: a credencial nunca entra em log, output de passo, erro ou evento. A política de destino (SSRF) continua valendo antes de qualquer envio.
- **Entrega em duas fatias**: primeiro o registro de connections na API; depois o `connectionId` no passo e o uso no worker.

## Consequences

- O workflow worker agora decifra secrets: um vazamento do processo expõe credenciais de connections, como já acontece com os signing secrets no integration worker.
- Apagar uma connection usada por uma versão ativa faz os passos falharem com `CONNECTION_NOT_FOUND`, sem retry. A API recusa apagar uma connection que uma versão ativa usa.
- `base_url` amarra o destino, mas não protege contra um `base_url` amplo demais (`https://`, um host compartilhado). Quem administra a connection decide o escopo.

## Alternatives considered

- **Secret referenciado direto no passo** (`{{secrets.crm}}`): mais flexível, mas o editor do workflow escolhe para onde o segredo vai.
- **OAuth2 com refresh de token já**: necessário para alguns providers, mas pode vir como outro tipo de autenticação sem mudar o modelo.
- **Resolver a credencial na API e mandar ao worker na fila**: a credencial ficaria em `execution_jobs` e em logs de fila.

## Follow-up

- Tipo `oauth2_client_credentials`.
- Rotação sem janela de falha (duas credenciais válidas durante a troca).
