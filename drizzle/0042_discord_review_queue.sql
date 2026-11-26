CREATE TABLE "discord_form_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(24) NOT NULL,
	"dedupe_key" text NOT NULL,
	"submission_id" uuid,
	"hackathon_id" uuid,
	"payload" jsonb,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"outcome" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"channel_snowflake" text,
	"message_snowflake" text,
	"message_stale" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_review_items_kind_check" CHECK ("discord_review_items"."kind" in ('submission', 'channel_decision', 'import_duplicate')),
	CONSTRAINT "discord_review_items_status_check" CHECK ("discord_review_items"."status" in ('pending', 'resolved'))
);
--> statement-breakpoint
ALTER TABLE "discord_guilds" ADD COLUMN "review_channel_snowflake" text;--> statement-breakpoint
ALTER TABLE "discord_guilds" ADD COLUMN "review_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discord_review_items" ADD CONSTRAINT "discord_review_items_submission_id_hackathon_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."hackathon_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_review_items" ADD CONSTRAINT "discord_review_items_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discord_form_drafts_updated_idx" ON "discord_form_drafts" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discord_review_items_kind_dedupe_idx" ON "discord_review_items" USING btree ("kind","dedupe_key");--> statement-breakpoint
CREATE INDEX "discord_review_items_status_created_idx" ON "discord_review_items" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "discord_review_items_submission_idx" ON "discord_review_items" USING btree ("submission_id");