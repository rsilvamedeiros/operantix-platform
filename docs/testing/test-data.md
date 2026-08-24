# Test Data

## Rules

- factories/builders geram dados sintéticos;
- nunca copiar dados reais de cliente para fixtures;
- IDs/tenants legíveis nos testes para evidenciar isolamento;
- secrets são fake e não reutilizam formatos reais quando desnecessário;
- datasets AI de avaliação são versionados e sem PII real.

Integration/E2E cleanup deve ser determinístico e não depender da ordem dos testes.
