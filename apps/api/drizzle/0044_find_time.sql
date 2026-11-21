ALTER TABLE "mate_requests" ALTER COLUMN "to_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mate_requests" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "mate_requests" ADD COLUMN "guest_email" text;--> statement-breakpoint
ALTER TABLE "mate_requests" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "mate_requests" ADD COLUMN "meeting" jsonb;--> statement-breakpoint
ALTER TABLE "mate_requests" ADD COLUMN "slots" jsonb;--> statement-breakpoint
ALTER TABLE "mate_requests" ADD COLUMN "booked" jsonb;--> statement-breakpoint
ALTER TABLE "mate_requests" ADD CONSTRAINT "mate_requests_token_unique" UNIQUE("token");