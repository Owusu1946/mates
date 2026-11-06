CREATE TABLE "browser_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"run_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"url" text DEFAULT 'about:blank' NOT NULL,
	"title" text DEFAULT 'Browser' NOT NULL,
	"pending_action" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;