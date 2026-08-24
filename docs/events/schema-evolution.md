# Event Schema Evolution

## Compatibility

Adicionar campos opcionais é preferível. Não mudar semântica de campo existente silenciosamente.

## Versioning

Breaking change gera nova versão do evento. Producers e consumers devem permitir janela de migração.

## Future registry

Schema Registry + Avro/Protobuf será avaliado quando contratos Kafka estabilizarem. Inicialmente JSON Schema/Zod compartilhado pode ser suficiente para TypeScript; Python precisa de contrato interoperável.
