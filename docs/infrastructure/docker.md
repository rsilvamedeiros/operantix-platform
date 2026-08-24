# Docker

Cada workload executável terá Dockerfile próprio. Imagens multi-stage, usuário não-root quando viável, healthcheck externo, build determinístico e contexto mínimo. Não embutir secrets em build args/layers.
