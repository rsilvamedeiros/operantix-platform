mock_provider "aws" {}

variables {
  name               = "test"
  vpc_id             = "vpc-123"
  subnet_ids         = ["subnet-a", "subnet-b"]
  security_group_ids = ["sg-alb"]
  certificate_arn    = "arn:aws:acm:eu-west-1:123456789012:certificate/abc"
}

run "faces_the_internet_but_drops_malformed_headers" {
  command = apply

  assert {
    condition     = aws_lb.this.internal == false && aws_lb.this.drop_invalid_header_fields == true
    error_message = "Expected a public load balancer that drops invalid headers."
  }
}

run "https_uses_a_modern_tls_policy" {
  command = apply

  assert {
    condition     = aws_lb_listener.https.protocol == "HTTPS" && startswith(aws_lb_listener.https.ssl_policy, "ELBSecurityPolicy-TLS13")
    error_message = "The HTTPS listener must use a TLS 1.3 policy."
  }
}

run "there_is_no_plain_http_listener" {
  command = apply

  assert {
    condition     = aws_lb_listener.https.port == 443
    error_message = "Only the HTTPS listener exists."
  }
}

run "targets_are_probed_on_readiness" {
  command = apply

  assert {
    condition     = aws_lb_target_group.this.target_type == "ip" && aws_lb_target_group.this.health_check[0].path == "/health/ready"
    error_message = "Expected IP targets (Fargate) probed on /health/ready."
  }
}

run "protected_against_deletion_by_default" {
  command = apply

  assert {
    condition     = aws_lb.this.enable_deletion_protection == true
    error_message = "Deletion protection is the default."
  }
}
