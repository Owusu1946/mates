CREATE TABLE "morning_brief_settings" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"time" text DEFAULT '07:00' NOT NULL,
	"timezone" text NOT NULL,
	"weekends" text DEFAULT 'light' NOT NULL,
	"sections" jsonb NOT NULL,
	"next_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "morning_brief_due" ON "morning_brief_settings" USING btree ("enabled","next_run_at");