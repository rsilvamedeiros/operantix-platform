# Plan-level properties of the network, checked against a mocked AWS provider (no credentials).

mock_provider "aws" {
  # The mock would otherwise return random strings where AWS expects ARNs and JSON.
  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:eu-west-1:123456789012:log-group:/test/vpc-flow"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/test-vpc-flow"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  name = "test"
  azs  = ["eu-west-1a", "eu-west-1b"]
}

run "three_tiers_in_every_zone" {
  command = apply

  assert {
    condition     = length(aws_subnet.public) == 2 && length(aws_subnet.private) == 2 && length(aws_subnet.data) == 2
    error_message = "Expected one public, private and data subnet per availability zone."
  }
}

run "data_tier_has_no_route_out" {
  command = apply

  assert {
    condition     = length(aws_route_table.data.route) == 0
    error_message = "The data tier must have no default route, to the internet or to a NAT gateway."
  }

  assert {
    condition     = alltrue([for s in aws_subnet.data : s.map_public_ip_on_launch == false])
    error_message = "Data subnets must not hand out public addresses."
  }
}

run "only_the_public_tier_has_an_internet_gateway_route" {
  command = apply

  assert {
    condition     = aws_route.public_internet.destination_cidr_block == "0.0.0.0/0"
    error_message = "The public tier needs a default route to the internet gateway."
  }

  assert {
    condition     = length(aws_route.private_nat) == 2
    error_message = "Each private subnet needs a default route to a NAT gateway."
  }
}

run "one_nat_gateway_per_zone_by_default" {
  command = apply

  assert {
    condition     = length(aws_nat_gateway.this) == 2
    error_message = "Expected one NAT gateway per availability zone."
  }
}

run "a_single_nat_gateway_on_request" {
  command = apply

  variables {
    single_nat_gateway = true
  }

  assert {
    condition     = length(aws_nat_gateway.this) == 1
    error_message = "Expected a single shared NAT gateway."
  }

  assert {
    condition     = length(aws_route.private_nat) == 2
    error_message = "Every private subnet must still route out through the shared gateway."
  }
}

run "databases_accept_traffic_only_from_workloads" {
  command = apply

  assert {
    condition     = aws_vpc_security_group_ingress_rule.data_postgres.referenced_security_group_id == aws_security_group.app.id
    error_message = "PostgreSQL must be reachable only from the workload security group."
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.data_redis.referenced_security_group_id == aws_security_group.app.id
    error_message = "Redis must be reachable only from the workload security group."
  }

  assert {
    condition     = length(aws_security_group.data.egress) == 0
    error_message = "The data security group must have no egress rules."
  }
}

run "workloads_take_load_balancer_traffic_only" {
  command = apply

  assert {
    condition     = aws_vpc_security_group_ingress_rule.app_from_alb.referenced_security_group_id == aws_security_group.alb.id
    error_message = "The API must be reachable only through the load balancer."
  }
}

run "flow_logs_are_on" {
  command = apply

  assert {
    condition     = aws_flow_log.this.traffic_type == "ALL"
    error_message = "VPC flow logs must record all traffic."
  }
}

run "rejects_a_single_zone" {
  command = plan

  variables {
    azs = ["eu-west-1a"]
  }

  expect_failures = [var.azs]
}
