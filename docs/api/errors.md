# API Errors

Formato alvo:
```json
{"code":"WORKFLOW_NOT_FOUND","message":"Workflow not found","traceId":"...","details":{}}
```
`code` é estável para máquinas. `message` é seguro para cliente. Stack trace fica apenas em observabilidade.
