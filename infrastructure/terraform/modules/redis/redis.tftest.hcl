mock_provider "aws" {}

variables {
  name               = "test"
  subnet_ids         = ["subnet-a", "subnet-b"]
  security_group_ids = ["sg-data"]
}

run "data_is_encrypted_at_rest" {
  command = apply

  assert {
    condition     = aws_elasticache_replication_group.this.at_rest_encryption_enabled == "true"
    error_message = "The cache must be encrypted at rest."
  }
}

run "single_node_has_no_failover" {
  command = apply

  assert {
    condition     = aws_elasticache_replication_group.this.automatic_failover_enabled == false
    error_message = "Automatic failover needs at least one replica."
  }
}

run "replicas_turn_failover_and_multi_az_on" {
  command = apply

  variables {
    num_cache_clusters = 2
  }

  assert {
    condition     = aws_elasticache_replication_group.this.automatic_failover_enabled == true && aws_elasticache_replication_group.this.multi_az_enabled == true
    error_message = "Two nodes must fail over automatically across zones."
  }
}

run "tls_is_opt_in_until_the_client_supports_it" {
  command = apply

  assert {
    condition     = aws_elasticache_replication_group.this.transit_encryption_enabled == false
    error_message = "TLS stays off by default."
  }
}

run "tls_on_request" {
  command = apply

  variables {
    transit_encryption_enabled = true
  }

  assert {
    condition     = aws_elasticache_replication_group.this.transit_encryption_enabled == true
    error_message = "Expected TLS when asked for."
  }
}

run "rejects_an_empty_group" {
  command = plan

  variables {
    num_cache_clusters = 0
  }

  expect_failures = [var.num_cache_clusters]
}
