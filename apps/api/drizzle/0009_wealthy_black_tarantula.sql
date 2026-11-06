CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"chat_id" text,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"remind_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("status","remind_at");--> statement-breakpoint
CREATE INDEX "reminders_user_idx" ON "reminders" USING btree ("clerk_user_id","remind_at");