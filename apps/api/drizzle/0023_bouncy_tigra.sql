CREATE TABLE "slack_installs" (
	"team_id" text PRIMARY KEY NOT NULL,
	"team_name" text NOT NULL,
	"bot_user_id" text NOT NULL,
	"bot_token_enc" text NOT NULL,
	"installed_by" text NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_links" (
	"team_id" text NOT NULL,
	"slack_user_id" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slack_links_team_id_slack_user_id_pk" PRIMARY KEY("team_id","slack_user_id")
);
--> statement-breakpoint
CREATE TABLE "slack_runs" (
	"delegation_id" uuid PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"thread_ts" text NOT NULL,
	"status_ts" text,
	"mate_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"slack_user_id" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"delivered_at" timestamp with time zone,
	"delivered_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_links" ADD CONSTRAINT "slack_links_team_id_slack_installs_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."slack_installs"("team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_runs" ADD CONSTRAINT "slack_runs_delegation_id_delegations_id_fk" FOREIGN KEY ("delegation_id") REFERENCES "public"."delegations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_runs" ADD CONSTRAINT "slack_runs_team_id_slack_installs_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."slack_installs"("team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slack_links_user_idx" ON "slack_links" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "slack_runs_pending_idx" ON "slack_runs" USING btree ("delivered_at");