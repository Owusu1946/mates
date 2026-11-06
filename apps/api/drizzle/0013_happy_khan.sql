CREATE TABLE "mission_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"author_mate_id" uuid,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"goal" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"idle_rounds" integer DEFAULT 0 NOT NULL,
	"question" text,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mission_notes" ADD CONSTRAINT "mission_notes_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mission_notes" ADD CONSTRAINT "mission_notes_author_mate_id_mates_id_fk" FOREIGN KEY ("author_mate_id") REFERENCES "public"."mates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mission_notes_title_idx" ON "mission_notes" USING btree ("mission_id",lower("title"));--> statement-breakpoint
CREATE INDEX "missions_user_idx" ON "missions" USING btree ("clerk_user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "missions_live_chat_idx" ON "missions" USING btree ("chat_id") WHERE status IN ('running','needs_input','paused');