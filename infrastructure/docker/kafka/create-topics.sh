#!/usr/bin/env bash
# Creates the topics Operantix publishes to. Brokers never auto-create topics, so a typo in a
# topic name fails loudly instead of silently creating a new one.
set -euo pipefail

BOOTSTRAP="${KAFKA_BOOTSTRAP:-kafka:29092}"

create() {
  /opt/kafka/bin/kafka-topics.sh --bootstrap-server "$BOOTSTRAP" --create --if-not-exists \
    --topic "$1" --partitions "$2" --replication-factor 1
}

# Execution lifecycle events, keyed by executionId (docs/events/kafka.md).
create opx.execution.events.v1 6
