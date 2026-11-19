CREATE TABLE "computer_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"computer_id" uuid NOT NULL,
	"chat_id" text,
	"mate_id" uuid,
	"goal" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"waiting_for" text,
	"question" text,
	"reply" text,
	"approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recording_path" text,
	"model" text,
	"cost_usd" real,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "computers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"provider" text DEFAULT 'daytona' NOT NULL,
	"provider_id" text,
	"snapshot" text,
	"state" text DEFAULT 'off' NOT NULL,
	"on_since" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"controller" text DEFAULT 'mate' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "computers_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "computer_goals" ADD CONSTRAINT "computer_goals_computer_id_computers_id_fk" FOREIGN KEY ("computer_id") REFERENCES "public"."computers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_goals" ADD CONSTRAINT "computer_goals_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_goals" ADD CONSTRAINT "computer_goals_mate_id_mates_id_fk" FOREIGN KEY ("mate_id") REFERENCES "public"."mates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "computer_goals_user_idx" ON "computer_goals" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "computer_goals_active_idx" ON "computer_goals" USING btree ("computer_id") WHERE status IN ('running','waiting');