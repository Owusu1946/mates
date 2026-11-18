CREATE TABLE "run_timings" (
	"delegation_id" uuid PRIMARY KEY NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"setup_done_at" timestamp with time zone,
	"first_token_at" timestamp with time zone,
	"first_text_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"client_first_text_ms" integer,
	"tool_steps" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_timings" ADD CONSTRAINT "run_timings_delegation_id_delegations_id_fk" FOREIGN KEY ("delegation_id") REFERENCES "public"."delegations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_timings_submitted_idx" ON "run_timings" USING btree ("submitted_at");
