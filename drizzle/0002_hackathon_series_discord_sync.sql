CREATE TABLE "hackathon_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(180) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"website_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hackathon_series_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "discord_channels" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "hackathons" ADD COLUMN "series_id" uuid;--> statement-breakpoint
INSERT INTO "hackathon_series" ("name", "slug", "website_url", "created_at", "updated_at")
SELECT DISTINCT ON (series_slug)
	series_name,
	series_slug,
	website_url,
	now(),
	now()
FROM (
	SELECT
		h.name AS series_name,
		coalesce(nullif(regexp_replace(regexp_replace(regexp_replace(lower(h.name), '(19|20)[0-9]{2}', '', 'g'), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'), ''), 'hackathon') AS series_slug,
		h.website_url,
		h.created_at
	FROM "hackathons" h
) normalized
ORDER BY series_slug, created_at;--> statement-breakpoint
UPDATE "hackathons" h
SET "series_id" = hs."id"
FROM "hackathon_series" hs
WHERE hs."slug" = coalesce(nullif(regexp_replace(regexp_replace(regexp_replace(lower(h.name), '(19|20)[0-9]{2}', '', 'g'), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'), ''), 'hackathon');--> statement-breakpoint
UPDATE "discord_channels" dc
SET "series_id" = h."series_id"
FROM "hackathons" h
WHERE dc."hackathon_id" = h."id";--> statement-breakpoint
WITH ranked_channels AS (
	SELECT
		"id",
		row_number() OVER (PARTITION BY "guild_id", "series_id" ORDER BY "created_at", "id") AS row_number
	FROM "discord_channels"
	WHERE "series_id" IS NOT NULL
)
UPDATE "discord_channels" dc
SET "series_id" = null
FROM ranked_channels ranked
WHERE dc."id" = ranked."id" AND ranked.row_number > 1;--> statement-breakpoint
CREATE INDEX "hackathon_series_slug_idx" ON "hackathon_series" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "discord_channels" ADD CONSTRAINT "discord_channels_series_id_hackathon_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."hackathon_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackathons" ADD CONSTRAINT "hackathons_series_id_hackathon_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."hackathon_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discord_channels_guild_series_idx" ON "discord_channels" USING btree ("guild_id","series_id");--> statement-breakpoint
CREATE INDEX "hackathons_series_idx" ON "hackathons" USING btree ("series_id");
