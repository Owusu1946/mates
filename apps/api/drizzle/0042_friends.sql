CREATE TABLE "friend_invites" (
	"code" text PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"to_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friends" (
	"clerk_user_id" text NOT NULL,
	"friend_user_id" text NOT NULL,
	"permissions" jsonb DEFAULT '{"freeTimes":true,"messages":true,"answers":false}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friends_clerk_user_id_friend_user_id_pk" PRIMARY KEY("clerk_user_id","friend_user_id")
);
--> statement-breakpoint
CREATE INDEX "friend_invites_user_idx" ON "friend_invites" USING btree ("clerk_user_id","created_at");--> statement-breakpoint
CREATE INDEX "friend_invites_to_idx" ON "friend_invites" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "friends_friend_idx" ON "friends" USING btree ("friend_user_id");