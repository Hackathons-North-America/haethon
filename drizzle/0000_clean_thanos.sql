CREATE TYPE "public"."application_status" AS ENUM('interested', 'applied', 'accepted', 'attending', 'attended', 'won');--> statement-breakpoint
CREATE TYPE "public"."attendance_source" AS ENUM('inferred', 'manual', 'organizer_verified', 'admin_verified');--> statement-breakpoint
CREATE TYPE "public"."hackathon_format" AS ENUM('online', 'in_person');--> statement-breakpoint
CREATE TYPE "public"."hackathon_status" AS ENUM('draft', 'upcoming', 'live', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'approved', 'rejected', 'merged');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'qualified', 'closed');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'discord', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."organization_membership_role" AS ENUM('owner', 'admin', 'editor');--> statement-breakpoint
CREATE TYPE "public"."organization_membership_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."reminder_type" AS ENUM('application_open', 'application_close', 'acceptance_date', 'hackathon_start', 'check_in', 'submission_deadline', 'follow_up', 'add_to_profile', 'attendance_check');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin', 'organizer', 'sponsor');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('devpost', 'mlh', 'organizer_site', 'manual', 'other');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected', 'merged', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."submitter_type" AS ENUM('organizer', 'community');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"awarder" varchar(180),
	"awarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"hackathon_id" uuid,
	"channel_snowflake" text NOT NULL,
	"name" varchar(180) NOT NULL,
	"category" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_channels_channel_snowflake_unique" UNIQUE("channel_snowflake")
);
--> statement-breakpoint
CREATE TABLE "discord_guilds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_snowflake" text NOT NULL,
	"hackathon_id" uuid,
	"name" varchar(180) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_guilds_guild_snowflake_unique" UNIQUE("guild_snowflake")
);
--> statement-breakpoint
CREATE TABLE "hackathon_checkin_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"created_by_user_id" uuid,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hackathon_checkin_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "hackathon_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"application_opens_at" timestamp with time zone,
	"application_closes_at" timestamp with time zone,
	"acceptance_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hackathon_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"city" varchar(120),
	"region" varchar(120),
	"country" varchar(120) NOT NULL,
	"country_code" varchar(2),
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"coordinates" "geography"
);
--> statement-breakpoint
CREATE TABLE "hackathon_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"project_id" uuid,
	"user_id" uuid NOT NULL,
	"placement" varchar(120),
	"award_name" varchar(180),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hackathon_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"submitter_type" "submitter_type" NOT NULL,
	"organization_id" uuid,
	"matched_hackathon_id" uuid,
	"approved_hackathon_id" uuid,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"normalized_name" varchar(180) NOT NULL,
	"website_url" text NOT NULL,
	"source_url" text NOT NULL,
	"duplicate_score" numeric(5, 2) DEFAULT '0',
	"reviewer_notes" text,
	"rejection_reason" text,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hackathon_tags" (
	"hackathon_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "hackathon_tags_hackathon_id_tag_id_pk" PRIMARY KEY("hackathon_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "hackathons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"name" varchar(180) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"short_description" text,
	"website_url" text,
	"image_url" text,
	"application_url" text,
	"venue" varchar(160),
	"format" "hackathon_format" DEFAULT 'in_person' NOT NULL,
	"status" "hackathon_status" DEFAULT 'draft' NOT NULL,
	"beginner_friendly" boolean DEFAULT false NOT NULL,
	"travel_reimbursement" boolean DEFAULT false NOT NULL,
	"prize_amount_usd" integer,
	"vote_score" integer DEFAULT 0 NOT NULL,
	"last_verified_at" timestamp with time zone,
	"data_confidence_score" numeric(5, 2) DEFAULT '0',
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hackathons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_name" varchar(120) NOT NULL,
	"run_id" varchar(120) NOT NULL,
	"raw_payload_url" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "import_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"matched_hackathon_id" uuid,
	"external_id" varchar(200),
	"payload" jsonb NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"duplicate_score" numeric(5, 2) DEFAULT '0',
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "reminder_type" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "organization_membership_role" DEFAULT 'editor' NOT NULL,
	"status" "organization_membership_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"website_url" text,
	"logo_url" text,
	"description" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organizer_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizer_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_name" varchar(180) NOT NULL,
	"contact_name" varchar(180) NOT NULL,
	"email" text NOT NULL,
	"event_name" varchar(180),
	"website_url" text,
	"message" text,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hackathon_id" uuid,
	"title" varchar(180) NOT NULL,
	"description" text,
	"demo_url" text,
	"repo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"type" "reminder_type" NOT NULL,
	"channel" "notification_channel" DEFAULT 'email' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid,
	"source_type" "source_type" NOT NULL,
	"source_url" text NOT NULL,
	"reliability_score" numeric(5, 2) DEFAULT '0',
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" varchar(180) NOT NULL,
	"contact_name" varchar(180) NOT NULL,
	"email" text NOT NULL,
	"website_url" text,
	"message" text,
	"budget_usd" integer,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_hackathon_attendance_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"attended_on" date NOT NULL,
	"source" "attendance_source" DEFAULT 'inferred' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_hackathon_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"vote" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_hackathons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"application_status" "application_status" DEFAULT 'interested' NOT NULL,
	"is_saved" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"headline" varchar(160),
	"bio" text,
	"location_city" varchar(120),
	"location_region" varchar(120),
	"country_code" varchar(2),
	"school" varchar(160),
	"github_url" text,
	"linkedin_url" text,
	"instagram_url" text,
	"x_url" text,
	"devpost_url" text,
	"portfolio_url" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"image_url" text,
	"role" "role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_channels" ADD CONSTRAINT "discord_channels_guild_id_discord_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."discord_guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_channels" ADD CONSTRAINT "discord_channels_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_guilds" ADD CONSTRAINT "discord_guilds_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_checkin_codes" ADD CONSTRAINT "hackathon_checkin_codes_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_checkin_codes" ADD CONSTRAINT "hackathon_checkin_codes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_dates" ADD CONSTRAINT "hackathon_dates_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_locations" ADD CONSTRAINT "hackathon_locations_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_results" ADD CONSTRAINT "hackathon_results_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_results" ADD CONSTRAINT "hackathon_results_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_results" ADD CONSTRAINT "hackathon_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_submissions" ADD CONSTRAINT "hackathon_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_submissions" ADD CONSTRAINT "hackathon_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_submissions" ADD CONSTRAINT "hackathon_submissions_matched_hackathon_id_hackathons_id_fk" FOREIGN KEY ("matched_hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_submissions" ADD CONSTRAINT "hackathon_submissions_approved_hackathon_id_hackathons_id_fk" FOREIGN KEY ("approved_hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_submissions" ADD CONSTRAINT "hackathon_submissions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_tags" ADD CONSTRAINT "hackathon_tags_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_tags" ADD CONSTRAINT "hackathon_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathons" ADD CONSTRAINT "hackathons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_items" ADD CONSTRAINT "import_items_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_items" ADD CONSTRAINT "import_items_matched_hackathon_id_hackathons_id_fk" FOREIGN KEY ("matched_hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizer_claims" ADD CONSTRAINT "organizer_claims_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizer_claims" ADD CONSTRAINT "organizer_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hackathon_attendance_days" ADD CONSTRAINT "user_hackathon_attendance_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hackathon_attendance_days" ADD CONSTRAINT "user_hackathon_attendance_days_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hackathon_votes" ADD CONSTRAINT "user_hackathon_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hackathon_votes" ADD CONSTRAINT "user_hackathon_votes_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hackathons" ADD CONSTRAINT "user_hackathons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_hackathons" ADD CONSTRAINT "user_hackathons_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hackathon_checkin_codes_hackathon_idx" ON "hackathon_checkin_codes" USING btree ("hackathon_id");--> statement-breakpoint
CREATE INDEX "hackathon_dates_hackathon_idx" ON "hackathon_dates" USING btree ("hackathon_id");--> statement-breakpoint
CREATE INDEX "hackathon_dates_start_idx" ON "hackathon_dates" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "hackathon_locations_hackathon_idx" ON "hackathon_locations" USING btree ("hackathon_id");--> statement-breakpoint
CREATE INDEX "hackathon_locations_coordinates_idx" ON "hackathon_locations" USING gist ("coordinates");--> statement-breakpoint
CREATE INDEX "hackathon_submissions_status_idx" ON "hackathon_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hackathon_submissions_submitter_idx" ON "hackathon_submissions" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "hackathon_submissions_organization_idx" ON "hackathon_submissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "hackathons_status_idx" ON "hackathons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hackathons_format_idx" ON "hackathons" USING btree ("format");--> statement-breakpoint
CREATE UNIQUE INDEX "hackathons_name_slug_idx" ON "hackathons" USING btree ("name","slug");--> statement-breakpoint
CREATE INDEX "import_items_batch_idx" ON "import_items" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_user_idx" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_status_idx" ON "organization_memberships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "user_hackathon_attendance_unique_idx" ON "user_hackathon_attendance_days" USING btree ("user_id","hackathon_id","attended_on");--> statement-breakpoint
CREATE INDEX "user_hackathon_attendance_user_day_idx" ON "user_hackathon_attendance_days" USING btree ("user_id","attended_on");--> statement-breakpoint
CREATE UNIQUE INDEX "user_hackathon_votes_user_event_idx" ON "user_hackathon_votes" USING btree ("user_id","hackathon_id");--> statement-breakpoint
CREATE INDEX "user_hackathon_votes_hackathon_idx" ON "user_hackathon_votes" USING btree ("hackathon_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_hackathons_user_event_idx" ON "user_hackathons" USING btree ("user_id","hackathon_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");