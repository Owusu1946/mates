CREATE TABLE "chat_collaborators" (
	"chat_id" text NOT NULL,
	"mate_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chat_collaborators_chat_id_mate_id_pk" PRIMARY KEY("chat_id","mate_id")
);
--> statement-breakpoint
ALTER TABLE "chat_collaborators" ADD CONSTRAINT "chat_collaborators_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_collaborators" ADD CONSTRAINT "chat_collaborators_mate_id_mates_id_fk" FOREIGN KEY ("mate_id") REFERENCES "public"."mates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_collaborators_mate_idx" ON "chat_collaborators" USING btree ("mate_id");