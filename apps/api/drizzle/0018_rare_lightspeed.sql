CREATE TABLE "waitlist" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"referrer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
