CREATE TABLE "code_check_baselines" (
	"repo" text NOT NULL,
	"sha" text NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_check_baselines_repo_sha_pk" PRIMARY KEY("repo","sha")
);
--> statement-breakpoint
ALTER TABLE "code_runs" ADD COLUMN "run_key_hash" text;--> statement-breakpoint
ALTER TABLE "code_runs" ADD COLUMN "draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "code_runs" ADD COLUMN "install_failed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "code_runs" ADD COLUMN "notes" jsonb DEFAULT '[]'::jsonb NOT NULL;