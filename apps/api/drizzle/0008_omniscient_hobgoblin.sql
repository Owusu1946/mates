CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "recall_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"chat_id" text,
	"kind" text NOT NULL,
	"delegation_id" uuid,
	"attachment_id" uuid,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "history_recall" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "recall_entries" ADD CONSTRAINT "recall_entries_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_entries" ADD CONSTRAINT "recall_entries_delegation_id_delegations_id_fk" FOREIGN KEY ("delegation_id") REFERENCES "public"."delegations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_entries" ADD CONSTRAINT "recall_entries_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recall_user_idx" ON "recall_entries" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE INDEX "recall_embedding_idx" ON "recall_entries" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "recall_delegation_idx" ON "recall_entries" USING btree ("delegation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recall_attachment_idx" ON "recall_entries" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "memories_embedding_idx" ON "memories" USING hnsw ("embedding" vector_cosine_ops);