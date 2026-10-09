# Managed PostgreSQL for the transactional core (ADR-0037): encrypted, private, TLS only, with
# automated backups and point-in-time recovery. The master password is generated and kept by RDS
# in Secrets Manager, so it never appears in code or Terraform state.

locals {
  tags = merge(var.tags, { Module = "postgres" })
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids

  tags = local.tags
}

resource "aws_db_parameter_group" "this" {
  name   = var.name
  family = var.parameter_group_family

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  # Slow statements show up in the logs without logging every query.
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  tags = local.tags
}

resource "aws_db_instance" "this" {
  identifier = var.name

  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  db_name  = var.database_name
  username = var.master_username

  manage_master_user_password = true

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage > 0 ? var.max_allocated_storage : null
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_id

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = var.security_group_ids
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false
  multi_az               = var.multi_az

  backup_retention_period   = var.backup_retention_days
  backup_window             = "03:00-04:00"
  maintenance_window        = "sun:04:30-sun:05:30"
  copy_tags_to_snapshot     = true
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name}-final"

  auto_minor_version_upgrade            = true
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]

  tags = local.tags
}
