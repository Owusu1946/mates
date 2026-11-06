ALTER TABLE "attachments" ADD COLUMN "chat_id" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "content_text" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "analyzed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "attachments_chat_idx" ON "attachments" USING btree ("clerk_user_id","chat_id");