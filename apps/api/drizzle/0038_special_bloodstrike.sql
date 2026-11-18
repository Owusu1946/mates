ALTER TABLE "delegations" ADD COLUMN "followups_queued_at" timestamp with time zone;
--> statement-breakpoint
-- Legacy terminal runs already completed their old inline follow-ups; do not replay them through the new task.
UPDATE "delegations"
SET "followups_queued_at" = now()
WHERE "status" IN ('completed', 'failed', 'waiting', 'cancelled');
