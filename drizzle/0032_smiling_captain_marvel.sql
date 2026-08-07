CREATE TABLE "tech_icon_faceoff_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matchup_key" varchar(129) NOT NULL,
	"winner_slug" varchar(64) NOT NULL,
	"loser_slug" varchar(64) NOT NULL,
	"voter_fingerprint" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tech_icon_faceoff_votes_distinct_sides" CHECK ("tech_icon_faceoff_votes"."winner_slug" <> "tech_icon_faceoff_votes"."loser_slug")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tech_icon_faceoff_votes_ballot_idx" ON "tech_icon_faceoff_votes" USING btree ("matchup_key","voter_fingerprint");--> statement-breakpoint
CREATE INDEX "tech_icon_faceoff_votes_winner_idx" ON "tech_icon_faceoff_votes" USING btree ("winner_slug");--> statement-breakpoint
CREATE INDEX "tech_icon_faceoff_votes_loser_idx" ON "tech_icon_faceoff_votes" USING btree ("loser_slug");