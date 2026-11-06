CREATE TABLE "site_visits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"path" text NOT NULL,
	"referrer" text,
	"device" text NOT NULL,
	"visitor" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "site_visits_at_idx" ON "site_visits" USING btree ("at");