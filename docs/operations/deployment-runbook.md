# Deployment Runbook

## Before
Quality gates, migration compatibility, dependency health, rollback/roll-forward path.

## During
Deploy gradual quando suportado; observar error rate, latency, health e consumer lag.

## After
Smoke tests, dashboards, migrations concluídas e ausência de DLQ/error spike.

Não rollbackar código incompatível com migration destrutiva; preferir expand-contract.
