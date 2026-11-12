ALTER TABLE "calls" ADD COLUMN "kind" text DEFAULT 'call' NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "meeting" jsonb;