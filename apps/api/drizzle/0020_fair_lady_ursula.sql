ALTER TABLE "mates" ADD COLUMN "setup_at" timestamp with time zone;--> statement-breakpoint
-- Existing lead mates keep their name and look; only new accounts see the setup screen.
UPDATE "mates" SET "setup_at" = "created_at" WHERE "is_default" = true;