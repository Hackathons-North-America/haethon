ALTER TABLE "user_profiles" ADD COLUMN "devpost_verification_code" varchar(32);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "devpost_verified_handle" varchar(60);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "devpost_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "devpost_imported_at" timestamp with time zone;