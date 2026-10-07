CREATE TYPE "public"."execution_status" AS ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_version" integer NOT NULL,
	"status" "execution_status" DEFAULT 'PENDING' NOT NULL,
	"trigger_type" text NOT NULL,
	"triggered_by" uuid,
	"idempotency_key" text,
	"request_fingerprint" text,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "executions_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "executions_organization_id_workflow_id_idempotency_key_unique" UNIQUE("organization_id","workflow_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "step_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"step_id" text NOT NULL,
	"position" integer NOT NULL,
	"status" "step_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"output" jsonb,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "step_executions_execution_id_step_id_unique" UNIQUE("execution_id","step_id"),
	CONSTRAINT "step_executions_execution_id_position_unique" UNIQUE("execution_id","position")
);
--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_organization_id_workflow_id_workflows_organization_id_id_fk" FOREIGN KEY ("organization_id","workflow_id") REFERENCES "public"."workflows"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_workflow_id_workflow_version_workflow_versions_workflow_id_version_fk" FOREIGN KEY ("workflow_id","workflow_version") REFERENCES "public"."workflow_versions"("workflow_id","version") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_executions" ADD CONSTRAINT "step_executions_organization_id_execution_id_executions_organization_id_id_fk" FOREIGN KEY ("organization_id","execution_id") REFERENCES "public"."executions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "executions_workflow_id_created_at_id_index" ON "executions" USING btree ("workflow_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);