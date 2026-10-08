# Testing Package

Factories/utilitários de teste sem esconder comportamento crítico. Só para `devDependencies`.

- `startKafka()`: Kafka real (`apache/kafka:4.1.0`, mesma configuração do `compose.yaml`) via Testcontainers, com helpers para criar tópicos e ler mensagens.
