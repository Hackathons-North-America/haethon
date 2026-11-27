ALTER TABLE "discord_channel_jobs" DROP CONSTRAINT "discord_channel_jobs_status_check";--> statement-breakpoint
ALTER TABLE "discord_channel_jobs" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discord_channel_jobs" ADD COLUMN "blocks_queue" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "discord_channel_jobs" ADD CONSTRAINT "discord_channel_jobs_status_check" CHECK ("discord_channel_jobs"."status" in ('pending', 'running', 'retrying', 'done', 'failed'));