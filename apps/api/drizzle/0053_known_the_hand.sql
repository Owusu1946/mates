ALTER TABLE "delegations" ADD COLUMN "blocked_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "delegations" ADD COLUMN "blocked_reminder_at" timestamp with time zone;