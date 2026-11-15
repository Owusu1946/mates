ALTER TABLE "profiles" ADD COLUMN "bio_processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "bio_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "bio_lease_until" timestamp with time zone;