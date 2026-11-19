CREATE TABLE "action_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"category" text NOT NULL,
	"toolkit" text NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "action_grants_unique_idx" ON "action_grants" USING btree ("clerk_user_id","category","toolkit","target");