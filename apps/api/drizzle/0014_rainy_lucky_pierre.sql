CREATE TABLE "code_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"chat_id" text,
	"message_id" text,
	"installation_id" bigint NOT NULL,
	"repo" text NOT NULL,
	"base_branch" text NOT NULL,
	"branch" text NOT NULL,
	"task" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pr_number" integer,
	"pr_url" text,
	"summary" text,
	"sandbox_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"installation_id" bigint PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"account_login" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "code_runs_user_idx" ON "code_runs" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "code_runs_active_branch_idx" ON "code_runs" USING btree ("repo","branch") WHERE status IN ('queued','cloning','coding','checking','pushing');--> statement-breakpoint
CREATE INDEX "github_installations_user_idx" ON "github_installations" USING btree ("clerk_user_id");