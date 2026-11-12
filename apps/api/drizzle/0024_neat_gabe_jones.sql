CREATE TABLE "slack_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"mate_id" uuid NOT NULL,
	"ask" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_runs" ADD COLUMN "ask_ts" text;--> statement-breakpoint
ALTER TABLE "slack_queue" ADD CONSTRAINT "slack_queue_team_id_slack_installs_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."slack_installs"("team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slack_queue_mate_idx" ON "slack_queue" USING btree ("mate_id","created_at");--> statement-breakpoint
CREATE INDEX "slack_runs_thread_idx" ON "slack_runs" USING btree ("team_id","channel_id","thread_ts");