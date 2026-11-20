CREATE TABLE "mate_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"from_mate_id" uuid,
	"from_chat_id" text,
	"to_user_id" text NOT NULL,
	"to_chat_id" text,
	"text" text NOT NULL,
	"status" text NOT NULL,
	"policy" text NOT NULL,
	"draft" text,
	"answer" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mate_requests" ADD CONSTRAINT "mate_requests_from_mate_id_mates_id_fk" FOREIGN KEY ("from_mate_id") REFERENCES "public"."mates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mate_requests" ADD CONSTRAINT "mate_requests_from_chat_id_chats_id_fk" FOREIGN KEY ("from_chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mate_requests" ADD CONSTRAINT "mate_requests_to_chat_id_chats_id_fk" FOREIGN KEY ("to_chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mate_requests_from_idx" ON "mate_requests" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE INDEX "mate_requests_to_idx" ON "mate_requests" USING btree ("to_user_id","created_at");