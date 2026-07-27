ALTER TABLE "user_profiles" ADD COLUMN "share_token" varchar(64);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "share_token_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_share_token_unique" UNIQUE("share_token");