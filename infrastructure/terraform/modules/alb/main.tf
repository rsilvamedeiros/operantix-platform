# Public entry for the API (ADR-0038): HTTPS only, TLS 1.3 policy, malformed headers dropped.
# Targets are Fargate task IPs, probed on readiness so a task that lost its database leaves
# rotation.

locals {
  tags = merge(var.tags, { Module = "alb" })
}

resource "aws_lb" "this" {
  name               = var.name
  load_balancer_type = "application"
  internal           = false
  security_groups    = var.security_group_ids
  subnets            = var.subnet_ids

  drop_invalid_header_fields = true
  enable_deletion_protection = var.deletion_protection
  enable_http2               = true
  idle_timeout               = 60

  tags = local.tags
}

resource "aws_lb_target_group" "this" {
  name                 = "${var.name}-api"
  port                 = var.target_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    path                = var.health_check_path
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = local.tags
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }

  tags = local.tags
}
