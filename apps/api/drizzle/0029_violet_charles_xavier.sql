CREATE TABLE "activity_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"mate_id" uuid,
	"chat_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"local_dow" integer NOT NULL,
	"local_hour" integer NOT NULL,
	"local_minute" integer DEFAULT 0 NOT NULL,
	"timezone" text,
	"kind" text NOT NULL,
	"task_key" text,
	"label" text DEFAULT '' NOT NULL,
	"toolkit" text,
	"slug" text,
	"ref" text,
	"topic" text
);
--> statement-breakpoint
CREATE TABLE "habit_nudges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"mate_id" uuid,
	"task_key" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"line" text NOT NULL,
	"action_prompt" text NOT NULL,
	"trigger" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"confidence" real NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"next_due_at" timestamp with time zone,
	"last_nudged_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"automatic" boolean DEFAULT false NOT NULL,
	"routine_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"clerk_user_id" text NOT NULL,
	"topic" text NOT NULL,
	"weight" real NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "interests_clerk_user_id_topic_pk" PRIMARY KEY("clerk_user_id","topic")
);
--> statement-breakpoint
CREATE TABLE "meeting_preps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"attendees" jsonb NOT NULL,
	"meeting_url" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"chat_id" text,
	"brief" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "habit_learning" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "learn_from_apps" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "meeting_prep" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "habits_mined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "preps_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "observer_triggers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "habit_nudges" ADD CONSTRAINT "habit_nudges_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_task_idx" ON "activity_events" USING btree ("clerk_user_id","task_key","at");--> statement-breakpoint
CREATE INDEX "activity_user_at_idx" ON "activity_events" USING btree ("clerk_user_id","at");--> statement-breakpoint
CREATE INDEX "habit_nudges_user_idx" ON "habit_nudges" USING btree ("clerk_user_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "habits_user_task_idx" ON "habits" USING btree ("clerk_user_id","task_key");--> statement-breakpoint
CREATE INDEX "habits_due_idx" ON "habits" USING btree ("status","next_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_preps_event_idx" ON "meeting_preps" USING btree ("clerk_user_id","event_id");--> statement-breakpoint
CREATE INDEX "meeting_preps_due_idx" ON "meeting_preps" USING btree ("status","starts_at");