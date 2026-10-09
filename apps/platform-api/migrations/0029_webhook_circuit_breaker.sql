-- Per-endpoint circuit breaker (ADR-0032): while this is in the future the integration worker
-- does not call the endpoint. The state lives next to `consecutive_failures` so every worker
-- replica sees it.
ALTER TABLE "webhook_endpoints" ADD COLUMN "circuit_open_until" timestamp with time zone;--> statement-breakpoint
GRANT SELECT ("circuit_open_until") ON "webhook_endpoints" TO operantix_integration;--> statement-breakpoint
GRANT UPDATE ("circuit_open_until") ON "webhook_endpoints" TO operantix_integration;
