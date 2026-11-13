CREATE TABLE "watch_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"watch_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"met" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"event_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"chat_id" text,
	"mate_id" uuid,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"condition" text NOT NULL,
	"action" text NOT NULL,
	"request" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"interval_minutes" integer NOT NULL,
	"next_check_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"baseline" text,
	"last_note" text,
	"checks" integer DEFAULT 0 NOT NULL,
	"fired_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"warned_at" timestamp with time zone,
	"trigger" jsonb,
	"pending_fire" jsonb,
	"timezone" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_events" ADD CONSTRAINT "watch_events_watch_id_watches_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."watches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watches" ADD CONSTRAINT "watches_mate_id_mates_id_fk" FOREIGN KEY ("mate_id") REFERENCES "public"."mates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watch_events_watch_idx" ON "watch_events" USING btree ("watch_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "watch_events_event_idx" ON "watch_events" USING btree ("watch_id","event_id");--> statement-breakpoint
CREATE INDEX "watches_due_idx" ON "watches" USING btree ("status","next_check_at");--> statement-breakpoint
CREATE INDEX "watches_owner_idx" ON "watches" USING btree ("clerk_user_id","created_at");