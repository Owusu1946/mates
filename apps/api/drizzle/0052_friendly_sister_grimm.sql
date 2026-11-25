CREATE TABLE "proactive_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"mate_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proactive_notifications_source_key_unique" UNIQUE("source_key"),
	CONSTRAINT "proactive_notifications_status_check" CHECK ("proactive_notifications"."status" IN ('queued', 'quiet', 'brief', 'sending', 'sent', 'failed', 'uncertain', 'suppressed', 'included'))
);
--> statement-breakpoint
ALTER TABLE "watches" ADD COLUMN "urgent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "proactive_notifications" ADD CONSTRAINT "proactive_notifications_mate_id_mates_id_fk" FOREIGN KEY ("mate_id") REFERENCES "public"."mates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proactive_notifications_due_idx" ON "proactive_notifications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "proactive_notifications_budget_idx" ON "proactive_notifications" USING btree ("clerk_user_id","mate_id","sent_at");