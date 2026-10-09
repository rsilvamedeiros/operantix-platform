# alb

Application Load Balancer público só com HTTPS (política TLS 1.3, cabeçalhos inválidos descartados), alvo por IP de task e sonda em `/health/ready`. Precisa de um certificado ACM. Não há listener HTTP: o security group do módulo `network` só admite a porta 443. Aponte o domínio da API para `dns_name`.
