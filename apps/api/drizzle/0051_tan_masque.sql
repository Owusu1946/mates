CREATE TABLE "mate_notification_settings" (
	"clerk_user_id" text NOT NULL,
	"mate_id" uuid NOT NULL,
	"mode" text DEFAULT 'normal' NOT NULL,
	"quiet_start" text DEFAULT '22:00' NOT NULL,
	"quiet_end" text DEFAULT '07:00' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mate_notification_settings_clerk_user_id_mate_id_pk" PRIMARY KEY("clerk_user_id","mate_id"),
	CONSTRAINT "mate_notification_settings_mode_check" CHECK ("mate_notification_settings"."mode" IN ('normal', 'urgent_only', 'off')),
	CONSTRAINT "mate_notification_settings_start_check" CHECK ("mate_notification_settings"."quiet_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "mate_notification_settings_end_check" CHECK ("mate_notification_settings"."quiet_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
ALTER TABLE "mate_notification_settings" ADD CONSTRAINT "mate_notification_settings_mate_id_mates_id_fk" FOREIGN KEY ("mate_id") REFERENCES "public"."mates"("id") ON DELETE cascade ON UPDATE no action;