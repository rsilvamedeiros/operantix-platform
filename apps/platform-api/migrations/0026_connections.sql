CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"auth_type" text NOT NULL,
	"header_name" text,
	"credential_secret_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "connections_organization_id_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_organization_id_credential_secret_id_secrets_organization_id_id_fk" FOREIGN KEY ("organization_id","credential_secret_id") REFERENCES "public"."secrets"("organization_id","id") ON DELETE no action ON UPDATE no action;