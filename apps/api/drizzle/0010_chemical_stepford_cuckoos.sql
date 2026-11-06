CREATE TABLE "undo_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"tool_slug" text NOT NULL,
	"arguments" jsonb NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "undo_user_idx" ON "undo_actions" USING btree ("clerk_user_id");