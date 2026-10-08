CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"last_status_code" integer,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "webhook_deliveries_endpoint_id_event_id_unique" UNIQUE("endpoint_id","event_id"),
	CONSTRAINT "webhook_deliveries_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"status_code" integer,
	"error_code" text,
	"duration_ms" integer NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_endpoint_id_webhook_endpoints_organization_id_id_fk" FOREIGN KEY ("organization_id","endpoint_id") REFERENCES "public"."webhook_endpoints"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery_attempts" ADD CONSTRAINT "webhook_delivery_attempts_organization_id_delivery_id_webhook_deliveries_organization_id_id_fk" FOREIGN KEY ("organization_id","delivery_id") REFERENCES "public"."webhook_deliveries"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_due_idx" ON "webhook_deliveries" USING btree ("next_attempt_at") WHERE "webhook_deliveries"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "webhook_delivery_attempts_delivery_idx" ON "webhook_delivery_attempts" USING btree ("delivery_id");