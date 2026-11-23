CREATE TABLE "hackathon_votes" (
	"user_id" uuid NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hackathon_votes_user_id_hackathon_id_pk" PRIMARY KEY("user_id","hackathon_id"),
	CONSTRAINT "hackathon_votes_value_check" CHECK ("hackathon_votes"."value" in (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "hackathon_votes" ADD CONSTRAINT "hackathon_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathon_votes" ADD CONSTRAINT "hackathon_votes_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hackathon_votes_hackathon_value_idx" ON "hackathon_votes" USING btree ("hackathon_id","value");