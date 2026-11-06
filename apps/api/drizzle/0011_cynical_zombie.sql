CREATE TABLE "group_members" (
	"chat_id" text NOT NULL,
	"mate_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "group_members_chat_id_mate_id_pk" PRIMARY KEY("chat_id","mate_id")
);
--> statement-breakpoint
CREATE TABLE "mates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'companion' NOT NULL,
	"role_description" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'amber' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "kind" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "mate_id" uuid;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "leader_mate_id" uuid;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_mate_id_mates_id_fk" FOREIGN KEY ("mate_id") REFERENCES "public"."mates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_members_mate_idx" ON "group_members" USING btree ("mate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mates_user_name_idx" ON "mates" USING btree ("clerk_user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "mates_user_default_idx" ON "mates" USING btree ("clerk_user_id") WHERE "mates"."is_default";--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_mate_id_mates_id_fk" FOREIGN KEY ("mate_id") REFERENCES "public"."mates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_leader_mate_id_mates_id_fk" FOREIGN KEY ("leader_mate_id") REFERENCES "public"."mates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_latest_idx" ON "chat_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chats_mate_idx" ON "chats" USING btree ("mate_id");--> statement-breakpoint
-- Existing chats stay "legacy" (shown as Earlier chats); scheduled-routine chats are marked as such.
UPDATE "chats" SET "kind" = 'routine' WHERE "id" LIKE 'routine\_%';
