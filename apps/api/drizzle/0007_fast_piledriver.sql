CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"text" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"importance" integer DEFAULT 2 NOT NULL,
	"source" text DEFAULT 'explicit' NOT NULL,
	"source_chat_id" text,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "memory_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "auto_memory" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "memories_user_idx" ON "memories" USING btree ("clerk_user_id","updated_at");