ALTER TABLE "hackathons" ADD COLUMN "hna_approved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hackathons" ADD COLUMN "hna_approved_at" timestamp with time zone;