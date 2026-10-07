# Release Strategy

Mainline/short-lived branches. Deploy incremental. Backward compatibility para rolling deploys. Feature flags para capacidades incompletas/risco alto. Changelog de breaking API/event changes.


## Subidas (atual)

`main` protegida: sem push direto, CI verde e aprovação obrigatórias. Mudança chega à `main` por PR (squash). Deploy automático por ambiente só é definido no M09; até lá, "subir" significa merge na `main` com CI verde.
