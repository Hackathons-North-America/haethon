ALTER TABLE "user_hackathons" ALTER COLUMN "application_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user_hackathons" ALTER COLUMN "application_status" SET DEFAULT 'interested'::text;--> statement-breakpoint
UPDATE "user_hackathons" SET "application_status" = 'accepted' WHERE "application_status" = 'attending';--> statement-breakpoint
DROP TYPE "public"."application_status";--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('interested', 'applied', 'accepted', 'attended', 'won');--> statement-breakpoint
ALTER TABLE "user_hackathons" ALTER COLUMN "application_status" SET DEFAULT 'interested'::"public"."application_status";--> statement-breakpoint
ALTER TABLE "user_hackathons" ALTER COLUMN "application_status" SET DATA TYPE "public"."application_status" USING "application_status"::"public"."application_status";