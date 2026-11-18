CREATE TABLE "message_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" text NOT NULL,
	"mate_id" uuid,
	"run_id" uuid,
	"model" text,
	"rating" text NOT NULL,
	"reason" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_feedback_rating_check" CHECK ("rating" in ('up', 'down')),
	CONSTRAINT "message_feedback_reason_check" CHECK ("reason" is null or "reason" in ('wrong_answer', 'didnt_follow_instructions', 'too_slow', 'too_long', 'other'))
);
--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_mate_id_mates_id_fk" FOREIGN KEY ("mate_id") REFERENCES "public"."mates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_run_id_delegations_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."delegations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_feedback_user_message_idx" ON "message_feedback" USING btree ("clerk_user_id","message_id");--> statement-breakpoint
CREATE INDEX "message_feedback_created_rating_idx" ON "message_feedback" USING btree ("created_at","rating");