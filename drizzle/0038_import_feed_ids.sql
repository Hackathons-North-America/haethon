ALTER TYPE "public"."source_type" ADD VALUE 'hackclub' BEFORE 'organizer_site';--> statement-breakpoint
CREATE TABLE "hackathon_external_ids" (
	"external_id" varchar(200) PRIMARY KEY NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"last_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hackathon_external_ids" ADD CONSTRAINT "hackathon_external_ids_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hackathon_external_ids_hackathon_idx" ON "hackathon_external_ids" USING btree ("hackathon_id");