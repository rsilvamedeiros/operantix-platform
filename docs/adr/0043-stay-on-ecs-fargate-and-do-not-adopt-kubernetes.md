# ADR-0043 — Stay on ECS/Fargate and do not adopt Kubernetes

**Status:** Accepted  
**Date:** 2026-10-09

## Context

O ADR-0009 adiou Kubernetes e preferiu ECS/Fargate; o ADR-0038 implementou isso com um módulo `ecs-service` reaproveitado por todos os workloads. O M10 pede um spike antes de qualquer decisão em contrário.

## Decision

**Não adotar Kubernetes agora.** Permanecer em ECS/Fargate e registrar o que o spike mostrou e as condições que reabrem a decisão.

O spike (`infrastructure/kubernetes/spike`) descreve os mesmos workloads como manifests Kubernetes e os verifica de três formas:

- **Política de endurecimento** (23 testes): não-root, seccomp `RuntimeDefault`, raiz somente leitura, capabilities removidas, requests e limits, imagens fixadas, segredos só por `secretKeyRef`, token de service account não montado, probes, PDB para réplicas e Job de migração com `backoffLimit`. É o mesmo conjunto de garantias que o `ecs-service` dá, o que mostra que **segurança não é um motivo para migrar**: as duas plataformas chegam ao mesmo lugar.
- **API server real** (k3s 1.31 em Docker, `validate.sh`): os quatro arquivos são aceitos no `--dry-run=server`; as mesmas cargas sem `securityContext` são sinalizadas pelo Pod Security Admission do namespace `restricted`, e um pod privilegiado é rejeitado. Um achado para quem opera: o PSA só **rejeita Pods**; um Deployment sem endurecimento é aceito com aviso e falha depois, quando o ReplicaSet tenta criar os pods. Quem confia nele precisa tratar os avisos do `apply` como erro no CI.
- **O que não foi possível exercitar:** os pods não rodaram no ambiente do spike (o runc aninhado falhou ao criar o sandbox). Probes, rolling update, PDB e NetworkPolicy estão escritos, mas sem evidência de execução.

O que a adoção exigiria além dos manifests, e que o ECS já resolve ou dispensa hoje:

- Plano de controle e nós (EKS, grupos de nós ou Karpenter) com atualização de versão a cada poucos meses, mais o custo fixo do plano de controle gerenciado; conferir o preço vigente.
- CNI com suporte a NetworkPolicy (no ECS, security groups do módulo `network`), ingress controller e gestão de certificados (no ECS, ALB e ACM).
- Segredos: Secrets Store CSI ou External Secrets, e IAM Roles for Service Accounts (no ECS, secrets por ARN e role de tarefa).
- Autoescalonamento: metrics-server/HPA e KEDA para o backlog (ADR-0033); no ECS o gap equivalente já está registrado (ADR-0038).
- Um conjunto maior de conceitos para quem opera, num time sem esse requisito.

## Consequences

- O custo de operar a plataforma continua baixo e a história de deploy (ADR-0039) continua única.
- Reabrir a decisão (propostas) se houver ao menos dois destes: mais de um time publicando serviços no mesmo cluster, necessidade de operadores ou CRDs (por exemplo Kafka via operador em vez de serviço gerenciado), exigência de portabilidade entre nuvens, ou limites do Fargate que o produto passe a bater (CPU/memória por tarefa, tempo de cold start).
- Se reabrir, repetir o spike com pods de fato rodando (cluster real ou kind em máquina que suporte), e medir tempo de rollout e comportamento de PDB e NetworkPolicy.
- Os manifests ficam como referência, não como artefato de deploy.

## Alternatives

- **Adotar EKS já:** troca um modelo mais simples por um mais poderoso que nenhum requisito atual pede.
- **ECS sobre EC2:** mais controle de nós, mais operação; Fargate cobre o necessário.
- **Nomad ou outro orquestrador:** não avaliados; sem vantagem aparente sobre o serviço gerenciado da nuvem que já usamos.

## Follow-up

Tratar avisos de Pod Security como erro no CI se Kubernetes for adotado; repetir a verificação em execução real antes de qualquer migração.
