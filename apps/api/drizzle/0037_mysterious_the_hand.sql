ALTER TABLE "delegations" ADD COLUMN "execution_owner" text;--> statement-breakpoint
ALTER TABLE "delegations" ADD COLUMN "execution_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "delegations" ADD COLUMN "resume_checkpoint" boolean DEFAULT false NOT NULL;