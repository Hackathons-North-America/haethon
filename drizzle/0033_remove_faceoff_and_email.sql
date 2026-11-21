/* Face Off: the hackathons insert trigger writes into hackathon_faceoff_ratings,
   so it must go before the table or every new hackathon insert would fail.
   plpgsql bodies are not dependency-tracked, so DROP TABLE ... CASCADE below
   would leave both functions behind. */
DROP TRIGGER IF EXISTS "hackathons_create_faceoff_rating" ON "hackathons";--> statement-breakpoint
DROP FUNCTION IF EXISTS ensure_hackathon_faceoff_rating();--> statement-breakpoint
DROP FUNCTION IF EXISTS record_hackathon_faceoff_vote(uuid, uuid, varchar);--> statement-breakpoint
DELETE FROM "rate_limit_buckets" WHERE "key" LIKE 'faceoff-vote:%' OR "key" LIKE 'icon-faceoff%';--> statement-breakpoint
DROP TABLE "country_alert_subscriptions" CASCADE;--> statement-breakpoint
DROP TABLE "hackathon_faceoff_ratings" CASCADE;--> statement-breakpoint
DROP TABLE "notifications" CASCADE;--> statement-breakpoint
DROP TABLE "reminders" CASCADE;--> statement-breakpoint
DROP TABLE "tech_icon_faceoff_votes" CASCADE;--> statement-breakpoint
DROP TABLE "user_hackathon_notification_preferences" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email_unsubscribed_at";--> statement-breakpoint
DROP TYPE "public"."notification_channel";--> statement-breakpoint
DROP TYPE "public"."reminder_type";