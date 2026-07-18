ALTER TABLE "hackathons" ADD COLUMN "source" "source_type";--> statement-breakpoint
-- One-time compile of the badge each hackathon currently shows, so nothing
-- changes visually when reads switch to the column. Admin-pinned sentinel
-- rows win outright; everything else replays the legacy read-time vote:
-- most frequent URL-derived type, legacy priority order as the tie-break.
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
  AND h."source" IS NULL;--> statement-breakpoint
DROP TABLE "sources" CASCADE;
