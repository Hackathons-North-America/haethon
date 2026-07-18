-- Idempotent because an earlier version of migration 0019 may already have
-- added this column before this additive rollout migration replaced it.
ALTER TABLE "hackathons" ADD COLUMN IF NOT EXISTS "source" "source_type";--> statement-breakpoint
-- The earlier 0019 also dropped this table. Recreate it when necessary so the
-- schema stays compatible with old Vercel instances during this release.
CREATE TABLE IF NOT EXISTS "sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hackathon_id" uuid REFERENCES "hackathons"("id") ON DELETE cascade,
  "source_type" "source_type" NOT NULL,
  "source_url" text NOT NULL,
  "reliability_score" numeric(5, 2) DEFAULT '0',
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sources_hackathon_idx" ON "sources" USING btree ("hackathon_id");--> statement-breakpoint
-- Compile the currently displayed badge once. Admin overrides win; remaining
-- rows replay the legacy read-time vote so this release has no visual churn.
UPDATE "hackathons" h
SET "source" = s."source_type"
FROM "sources" s
WHERE s."hackathon_id" = h."id"
  AND s."source_url" = 'https://haethon.local/admin/source-override';--> statement-breakpoint
WITH derived AS (
  SELECT
    s."hackathon_id" AS hackathon_id,
    CASE
      WHEN s."source_url" = 'https://haethon.local/submissions/community-form' THEN 'manual'
      WHEN hosts.host = 'mlh.com' OR hosts.host LIKE '%.mlh.com'
        OR hosts.host = 'mlh.io' OR hosts.host LIKE '%.mlh.io'
        OR hosts.host = 'majorleaguehacking.com' OR hosts.host LIKE '%.majorleaguehacking.com' THEN 'mlh'
      WHEN hosts.host = 'lu.ma' OR hosts.host LIKE '%.lu.ma'
        OR hosts.host = 'luma.com' OR hosts.host LIKE '%.luma.com' THEN 'luma'
      WHEN hosts.host = 'cerebralvalley.ai' OR hosts.host LIKE '%.cerebralvalley.ai' THEN 'cerebral_valley'
      WHEN hosts.host = 'devpost.com' OR hosts.host LIKE '%.devpost.com' THEN 'devpost'
      ELSE 'other'
    END AS derived_type
  FROM "sources" s
  CROSS JOIN LATERAL (
    SELECT split_part(regexp_replace(lower(substring(s."source_url" from '^https?://([^/]+)')), '^www\.', ''), ':', 1) AS host
  ) hosts
  WHERE s."hackathon_id" IS NOT NULL
    AND s."source_url" <> 'https://haethon.local/admin/source-override'
),
ranked AS (
  SELECT
    hackathon_id,
    derived_type,
    count(*) AS votes,
    CASE derived_type
      WHEN 'mlh' THEN 7 WHEN 'luma' THEN 6 WHEN 'cerebral_valley' THEN 5 WHEN 'devpost' THEN 4
      WHEN 'organizer_site' THEN 3 WHEN 'other' THEN 2 WHEN 'manual' THEN 1
    END AS priority
  FROM derived
  GROUP BY hackathon_id, derived_type
),
picked AS (
  SELECT DISTINCT ON (hackathon_id) hackathon_id, derived_type
  FROM ranked
  ORDER BY hackathon_id, votes DESC, priority DESC
)
UPDATE "hackathons" h
SET "source" = picked.derived_type::"source_type"
FROM picked
WHERE picked.hackathon_id = h."id"
  AND h."source" IS NULL;

-- Deliberately retain sources for one compatibility release. It can be
-- removed after every production instance runs code that uses hackathons.source.
