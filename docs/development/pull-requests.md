# Pull Requests

## Fluxo

- O PR é aberto assim que a fatia vertical está pronta e validada localmente, a partir de uma branch curta, com destino `main`.
- Título no formato Conventional Commits, em inglês (vira a mensagem do squash).
- A descrição concentra o detalhe técnico, seguindo `.github/PULL_REQUEST_TEMPLATE.md`: problema, solução, escopo e non-goals, lista dos pontos técnicos alterados, testes (com evidência de TDD), segurança/tenancy, observabilidade, migrations, contratos, rollback.
- PR pequeno e coeso. Screenshot apenas quando UI muda.
- CI verde é pré-condição para revisão. Título e nome da branch são validados pelo workflow `pr-conventions`.
- Todo PR fora de draft recebe revisão automática (`code-review`); os achados são resolvidos antes do merge.
- Merge por squash após aprovação; a branch é apagada em seguida.
- Autoria e histórico seguem o fluxo normal do Git: sem assinaturas ou atribuições extras no PR.
