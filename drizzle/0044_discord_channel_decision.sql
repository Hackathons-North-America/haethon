ALTER TABLE "hackathons" ADD COLUMN "discord_channel_decision" varchar(16);--> statement-breakpoint
ALTER TABLE "hackathons" ADD CONSTRAINT "hackathons_discord_channel_decision_check" CHECK ("hackathons"."discord_channel_decision" is null or "hackathons"."discord_channel_decision" in ('approved', 'denied'));--> statement-breakpoint
-- Hackathons that already have a live channel keep it: their channel counts
-- as approved. Everything else waits for an admin's decision.
UPDATE "hackathons" SET "discord_channel_decision" = 'approved'
WHERE "discord_channel_decision" IS NULL
  AND EXISTS (
    SELECT 1 FROM "discord_channels" c
    WHERE c."hackathon_id" = "hackathons"."id" AND coalesce(c."category", '') <> 'deleted'
  );--> statement-breakpoint
-- Every queued "ensure" job was queued by an auto-approved import, not by an
-- admin. Auto-approval no longer makes channels, so they are closed as skipped
-- (not failed, which the admin Discord page would list as problems).
UPDATE "discord_channel_jobs"
SET "status" = 'done',
    "finished_at" = now(),
    "result" = '{"status":"skipped","reason":"Channels now wait for an admin decision; auto-approval no longer creates them."}'::jsonb
WHERE "status" = 'pending' AND "kind" = 'ensure';
