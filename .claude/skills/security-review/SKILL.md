---
name: security-review
description: Review Operantix changes for tenant isolation, authentication, authorization, secrets, input, webhooks, SSRF and AI security.
---

# Security Review

Review `$ARGUMENTS` read-only.

Prioritize:
1. cross-tenant access;
2. authn/authz bypass;
3. secret leakage;
4. injection/unsafe input;
5. webhook forgery/replay;
6. SSRF/outbound abuse;
7. AI prompt/tool injection/data leakage;
8. insecure defaults.

Give severity, exploit scenario, affected files and remediation.
