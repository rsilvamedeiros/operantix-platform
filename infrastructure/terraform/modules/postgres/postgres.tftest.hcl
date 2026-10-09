# Security and durability properties of the database, checked against a mocked AWS provider.

mock_provider "aws" {}

variables {
  name               = "test"
  subnet_ids         = ["subnet-a", "subnet-b"]
  security_group_ids = ["sg-data"]
}

run "storage_is_encrypted_and_private" {
  command = apply

  assert {
    condition     = aws_db_instance.this.storage_encrypted == true
    error_message = "Storage must be encrypted."
  }

  assert {
    condition     = aws_db_instance.this.publicly_accessible == false
    error_message = "The database must not be publicly accessible."
  }
}

run "master_password_never_enters_terraform" {
  command = apply

  assert {
    condition     = aws_db_instance.this.manage_master_user_password == true
    error_message = "RDS must generate and keep the master password in Secrets Manager."
  }

  assert {
    condition     = aws_db_instance.this.password == null
    error_message = "No password may be passed to the instance."
  }
}

run "connections_require_tls" {
  command = apply

  assert {
    condition     = one([for p in aws_db_parameter_group.this.parameter : p.value if p.name == "rds.force_ssl"]) == "1"
    error_message = "The parameter group must force TLS."
  }
}

run "backups_and_point_in_time_recovery_by_default" {
  command = apply

  assert {
    condition     = aws_db_instance.this.backup_retention_period == 7
    error_message = "Expected seven days of backups by default."
  }

  assert {
    condition     = aws_db_instance.this.copy_tags_to_snapshot == true
    error_message = "Snapshots must carry the instance tags."
  }
}

run "protected_against_deletion_by_default" {
  command = apply

  assert {
    condition     = aws_db_instance.this.deletion_protection == true && aws_db_instance.this.skip_final_snapshot == false
    error_message = "Deletion protection and a final snapshot are the defaults."
  }
}

run "multi_az_on_request" {
  command = apply

  variables {
    multi_az = true
  }

  assert {
    condition     = aws_db_instance.this.multi_az == true
    error_message = "Expected a standby in a second zone."
  }
}

run "rejects_disabled_backups" {
  command = plan

  variables {
    backup_retention_days = 0
  }

  expect_failures = [var.backup_retention_days]
}

run "rejects_a_single_subnet" {
  command = plan

  variables {
    subnet_ids = ["subnet-a"]
  }

  expect_failures = [var.subnet_ids]
}
