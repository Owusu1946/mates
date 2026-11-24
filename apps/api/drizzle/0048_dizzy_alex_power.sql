CREATE TABLE "morning_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"local_day" text NOT NULL,
	"timezone" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"lines" jsonb,
	"chat_id" text,
	"push_attempted_at" timestamp with time zone,
	"push_accepted_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "morning_briefs" ADD CONSTRAINT "morning_briefs_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "morning_briefs_user_day" ON "morning_briefs" USING btree ("clerk_user_id","local_day");--> statement-breakpoint
CREATE INDEX "morning_briefs_queue" ON "morning_briefs" USING btree ("status","lease_until");