CREATE TABLE "delegations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"chat_id" text,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"request" jsonb NOT NULL,
	"assistant_message_id" text NOT NULL,
	"parent_id" text,
	"agent_run_id" uuid,
	"provider_run_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pending_tool" jsonb,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"error" text,
	"heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delegation_id" uuid NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"receipt_id" text,
	"error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"timezone" text DEFAULT 'Africa/Accra' NOT NULL,
	"quiet_start" integer DEFAULT 22 NOT NULL,
	"quiet_end" integer DEFAULT 8 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"delegation_id" uuid PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"routine_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"version" integer NOT NULL,
	"delegation_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"chat_id" text,
	"title" text NOT NULL,
	"spec" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"delegation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_outbox" (
	"delegation_id" uuid PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "delegations" ADD CONSTRAINT "delegations_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_delegation_id_delegations_id_fk" FOREIGN KEY ("delegation_id") REFERENCES "public"."delegations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_delegation_id_delegations_id_fk" FOREIGN KEY ("delegation_id") REFERENCES "public"."delegations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_occurrences" ADD CONSTRAINT "routine_occurrences_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_occurrences" ADD CONSTRAINT "routine_occurrences_delegation_id_delegations_id_fk" FOREIGN KEY ("delegation_id") REFERENCES "public"."delegations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_delegation_id_delegations_id_fk" FOREIGN KEY ("delegation_id") REFERENCES "public"."delegations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_outbox" ADD CONSTRAINT "submission_outbox_delegation_id_delegations_id_fk" FOREIGN KEY ("delegation_id") REFERENCES "public"."delegations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delegations_owner_key" ON "delegations" USING btree ("clerk_user_id","request_key");--> statement-breakpoint
CREATE INDEX "delegations_owner_chat" ON "delegations" USING btree ("clerk_user_id","chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delegations_active_chat" ON "delegations" USING btree ("chat_id") WHERE status IN ('queued','running');--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_result_device" ON "deliveries" USING btree ("delegation_id","token");--> statement-breakpoint
CREATE INDEX "findings_owner" ON "findings" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_occurrence_key" ON "routine_occurrences" USING btree ("routine_id","scheduled_for","version");--> statement-breakpoint
CREATE INDEX "routines_due" ON "routines" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "routines_owner" ON "routines" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_events_sequence" ON "run_events" USING btree ("delegation_id","sequence");