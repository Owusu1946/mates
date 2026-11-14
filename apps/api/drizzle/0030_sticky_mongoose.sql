CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text,
	"type" text NOT NULL,
	"environment" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plan_grants" (
	"clerk_user_id" text NOT NULL,
	"kind" text NOT NULL,
	"plan" text NOT NULL,
	"expires_at" timestamp with time zone,
	"environment" text,
	"product_id" text,
	"store" text,
	"synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_grants_clerk_user_id_kind_pk" PRIMARY KEY("clerk_user_id","kind")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "plan_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "billing_events_status_idx" ON "billing_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "billing_events_user_idx" ON "billing_events" USING btree ("clerk_user_id");--> statement-breakpoint
-- Everyone's existing plan becomes a manual grant, so the plan in force is unchanged for all of them.
INSERT INTO "plan_grants" ("clerk_user_id", "kind", "plan", "updated_at")
SELECT "clerk_user_id", 'manual', "plan", now() FROM "profiles"
WHERE "plan" IS NOT NULL AND "plan" <> 'none'
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "profiles" SET "plan_source" = 'manual' WHERE "plan" IS NOT NULL AND "plan" <> 'none';
