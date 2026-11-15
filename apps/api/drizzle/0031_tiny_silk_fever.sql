ALTER TABLE "memories" ADD COLUMN "mate_id" uuid;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "bio_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "about_asked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_mate_id_mates_id_fk" FOREIGN KEY ("mate_id") REFERENCES "public"."mates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memories_user_mate_idx" ON "memories" USING btree ("clerk_user_id","mate_id");