-- Perf PR: hackathon vote totals (trigger-maintained), the Discord channel job queue,
-- and lower() city indexes. Body is the SQL in docs/perf/4-import-votes-db.md verbatim; every statement
-- is idempotent because these objects were first applied by hand on Nov 24 2026.

-- Schema changes for docs/perf/4-import-votes-db.md.
--
-- Additive and idempotent: safe to run more than once, and code deployed
-- before this change keeps working against the result. Statements are split
-- on the Drizzle breakpoint marker so this file can be used as a migration
-- body verbatim. Each statement runs on its own (the neon-http migrator does
-- not wrap a migration in a transaction), which CREATE INDEX CONCURRENTLY
-- needs.

-- 1. Vote totals per hackathon, maintained by a trigger on hackathon_votes.

CREATE TABLE IF NOT EXISTS "hackathon_vote_totals" (
	"hackathon_id" uuid PRIMARY KEY NOT NULL,
	"upvote_count" integer DEFAULT 0 NOT NULL,
	"downvote_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "hackathon_vote_totals_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hackathon_votes_sync_totals() RETURNS trigger AS $$
BEGIN
  -- The vote that was there before stops counting. Deleting a hackathon
  -- cascades to its votes and to its totals row; whichever goes first, this
  -- UPDATE either adjusts the row or matches nothing.
  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE' AND (NEW.hackathon_id IS DISTINCT FROM OLD.hackathon_id OR NEW.value IS DISTINCT FROM OLD.value)) THEN
    UPDATE hackathon_vote_totals
    SET upvote_count = upvote_count - (OLD.value = 1)::int,
        downvote_count = downvote_count - (OLD.value = -1)::int
    WHERE hackathon_id = OLD.hackathon_id;
  END IF;

  -- The vote that is there now starts counting.
  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE' AND (NEW.hackathon_id IS DISTINCT FROM OLD.hackathon_id OR NEW.value IS DISTINCT FROM OLD.value)) THEN
    INSERT INTO hackathon_vote_totals AS totals (hackathon_id, upvote_count, downvote_count)
    VALUES (NEW.hackathon_id, (NEW.value = 1)::int, (NEW.value = -1)::int)
    ON CONFLICT (hackathon_id) DO UPDATE
    SET upvote_count = totals.upvote_count + excluded.upvote_count,
        downvote_count = totals.downvote_count + excluded.downvote_count;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER hackathon_votes_sync_totals
AFTER INSERT OR DELETE OR UPDATE OF value, hackathon_id ON hackathon_votes
FOR EACH ROW EXECUTE FUNCTION hackathon_votes_sync_totals();
--> statement-breakpoint
-- Backfill (also the reconciliation query, should the totals ever need
-- checking). One statement, so one transaction: votes are locked against
-- writes for its few milliseconds, which makes the totals exact even if
-- someone votes while it runs. Only rows whose totals are wrong are rewritten.
DO $$
BEGIN
  LOCK TABLE hackathon_votes IN SHARE ROW EXCLUSIVE MODE;

  INSERT INTO hackathon_vote_totals AS totals (hackathon_id, upvote_count, downvote_count)
  SELECT hackathon_id,
         count(*) FILTER (WHERE value = 1)::int,
         count(*) FILTER (WHERE value = -1)::int
  FROM hackathon_votes
  GROUP BY hackathon_id
  ON CONFLICT (hackathon_id) DO UPDATE
  SET upvote_count = excluded.upvote_count, downvote_count = excluded.downvote_count
  WHERE (totals.upvote_count, totals.downvote_count) IS DISTINCT FROM (excluded.upvote_count, excluded.downvote_count);

  UPDATE hackathon_vote_totals AS totals
  SET upvote_count = 0, downvote_count = 0
  WHERE (totals.upvote_count <> 0 OR totals.downvote_count <> 0)
    AND NOT EXISTS (SELECT 1 FROM hackathon_votes WHERE hackathon_votes.hackathon_id = totals.hackathon_id);
END;
$$;
--> statement-breakpoint

-- 2. Queue for Discord channel work done after the response is sent.

CREATE TABLE IF NOT EXISTS "discord_channel_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"keep_existing" boolean DEFAULT false NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "discord_channel_jobs_hackathon_id_hackathons_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "discord_channel_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "discord_channel_jobs_status_check" CHECK ("discord_channel_jobs"."status" in ('pending', 'running', 'done', 'failed')),
	CONSTRAINT "discord_channel_jobs_kind_check" CHECK ("discord_channel_jobs"."kind" in ('ensure', 'refresh'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "discord_channel_jobs_pending_hackathon_idx" ON "discord_channel_jobs" USING btree ("hackathon_id") WHERE "discord_channel_jobs"."status" = 'pending';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discord_channel_jobs_status_created_idx" ON "discord_channel_jobs" USING btree ("status","created_at");
--> statement-breakpoint

-- 3. Exact city lookups for imports without coordinates.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "cities_lower_name_idx" ON "cities" USING btree (lower("name"));
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "cities_lower_ascii_name_idx" ON "cities" USING btree (lower("ascii_name"));
