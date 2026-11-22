-- Drop the `attending` pipeline stage. Postgres can't remove an enum value in
-- place, so detach the column to text, fold `attending` rows into `accepted`
-- (the closest remaining stage), then rebuild the type without it.
ALTER TABLE "user_hackathons" ALTER COLUMN "application_status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_hackathons" ALTER COLUMN "application_status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "user_hackathons" SET "application_status" = 'accepted' WHERE "application_status" = 'attending';--> statement-breakpoint
DROP TYPE "public"."application_status";--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('interested', 'applied', 'accepted', 'attended', 'won');--> statement-breakpoint
ALTER TABLE "user_hackathons" ALTER COLUMN "application_status" SET DATA TYPE "public"."application_status" USING "application_status"::"public"."application_status";--> statement-breakpoint
ALTER TABLE "user_hackathons" ALTER COLUMN "application_status" SET DEFAULT 'interested';
