-- Outbox relay role (ADR-0021): reads and marks the outbox of every tenant, and nothing else.
-- Outbox rows hold contract events only (ids, codes), so a cross-tenant view of them exposes
-- no tenant data. Created without LOGIN when missing; each environment sets LOGIN and the
-- password outside migrations (locally: infrastructure/docker/postgres/relay-role.sql).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'operantix_relay') THEN
    CREATE ROLE operantix_relay NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO operantix_relay;--> statement-breakpoint
GRANT SELECT, DELETE ON "outbox_events" TO operantix_relay;--> statement-breakpoint
-- Only the delivery mark: the relay can never change an event.
GRANT UPDATE ("published_at") ON "outbox_events" TO operantix_relay;--> statement-breakpoint
CREATE POLICY "outbox_relay" ON "outbox_events" TO operantix_relay
  USING (true) WITH CHECK (true);
