# Performance 4: JSON import, Create New Channel, votes, database review

Branch `t3/speed-import-votes-db`. Scope: the admin JSON importer and its Discord step, hackathon votes, and a database-wide review.

## Results

| What the user does | Before | After | DB round trips |
|---|---|---|---|
| Click **Yes** on one import card | 1557 ms (p95 1727) | **175 ms** (p95 201) | 17 → 2 |
| Click **Approve channel** ("Create New Channel") | 2017 ms (p95 2058) | **158 ms** response (p95 169); the importer no longer waits for it at all | 10 → 2 |
| Import 20 auto-approved cards | 56.1 s (20 requests) | **0.22 s** (1 request) | 420 → 2 |
| Re-import 20 cards the scraper sent before, unchanged | 3230 ms | **155 ms** | 42 → 2 |
| Cast or switch a vote | 344 ms (p95 353) | **69 ms** (p95 74) | 5 → 1 |
| Clear a vote | 343 ms (p95 348) | **69 ms** (p95 74) | 5 → 1 |
| `GET /api/hackathons`, signed out, production build against the real database | 28.7 ms (p95 33.9) | **3.1 ms** (p95 4.5) | 1 → 0 |
| `GET /api/hackathons?sort=top`, same | 27.2 ms (p95 30.5) | **3.7 ms** (p95 4.4) | 1 → 0 |

Times are medians. The first six rows are handler timings on the local test database, where one round trip costs 67 ms; on the real Neon database a round trip measured 24.8 ms from this machine, so absolute times in production are lower in both columns and the ratio is roughly the round-trip ratio. The last two rows are real HTTP requests to `pnpm start -p 3104`. Method and caveats are under [How it was measured](#how-it-was-measured).

The Discord work did not get faster, it moved. A channel still takes about 1.8 s (7 Discord calls at a simulated 150 ms each), and 20 channels take about 35 s, but that now happens after the response. The importer shows each channel's link, or the reason it failed, as it finishes.

Two things did not improve and are worth knowing:

- **Vote counts at today's volume.** Production holds 3 votes. Aggregating them took 0.1 ms before and reading the totals takes 0.1 ms now. The new design only pays off in SQL terms at volume (5.2 ms → 0.2 ms at 260,000 votes). What helps today is the round trips: one per vote instead of five, and none for signed-out catalog reads.
- **An uncached "Top voted" page** is still three round trips (173 ms → 163 ms locally). The vote part of that query went from 11.1 ms to 0.6 ms at 260,000 votes, but the page's other two queries are agent 1's.

## What changed and why

### A. Import (`/admin/import`)

**Reads and writes are batched** (`lib/hackathons/review-service.ts`, `importAdminHackathons`). The old code made every query on its own, in sequence, per row: duplicate candidates, feed-id lookup, organization, series, slug, city, then five inserts, then three more queries for the Discord preview. The new code:

1. sends everything every row needs to know in one `db.batch` (one HTTP round trip): duplicate candidates and slugs, feed-id links, organizations, series, tracked Discord channels, and one city lookup per distinct city;
2. decides every row in memory, in the original order, so a row still sees the rows before it (a repeated feed id updates the earlier row, a duplicate of an earlier row is flagged, same-named rows get distinct slugs);
3. sends all writes in a second `db.batch`. A batch is one transaction, so a hackathon can no longer be left without its dates or location if a later insert fails.

Rows that change a hackathon already in the catalog (a feed update with real changes, an auto-merge) keep the existing read-modify-write code. Queued writes are flushed before each of those so order is preserved. An unchanged re-import, the most common scraper row, needs no such path and rides in the batch.

New rows get their id from `randomUUID()` so dependent rows can be written in the same batch. The organization and series are referenced by slug in a subselect (`(select id from organizations where slug = …)`), which stays correct if another import created them a moment earlier.

**Image vetting moved after the response.** Vetting downloads the image (52 ms median, 277 ms p95 for a 215 KB Luma cover from this machine). The URL is now stored as sent and checked with `after()`; one that turns out dead is cleared, guarded on the stored URL so an admin's edit in between survives. I chose store-then-clear over clear-then-store because nearly every scraper image is valid, and the other order would publish every card without its image for a moment and regenerate the catalog cache twice per import.

**The Discord preview no longer waits on Discord per card.** The preview ("create" or "recycle") is now a pure function over data from the read batch (`previewDiscordChannel` in `lib/discord/sync.ts`). The guild listing it uses to spot hand-made channels is requested at the start of the request so it overlaps the database work, shared for 30 seconds, and abandoned after 1.5 seconds. That cap matters: of 12 real `GET /guilds/:id/channels` calls I made, one was rate-limited and blocked for 56.8 s.

**The importer sends auto-approved cards 25 per request** instead of one each, and falls back to one card per request for a chunk that fails, so one bad card still only costs itself.

**Admin routes skip the user lookup.** `requireAdminUserId()` (new, `lib/auth.ts`) takes the admin's id from the session claims, as `getCurrentUserId()` already does on read paths.

**City lookups use an index.** See part C.

### A. Create New Channel

Approving a channel now queues a job and returns `202` with the job id. `lib/discord/channel-jobs.ts` holds the queue:

- **Idempotent.** A partial unique index allows one pending job per hackathon. A second click returns the job already waiting. The importer also ignores a second click on the prompt.
- **One job at a time, across all server instances.** The sync is not safe to run concurrently: two runs could each create a channel for the same series, or renumber one category from different snapshots. Before this change the importer's await kept them apart; with background work that guarantee has to come from the database. A worker claims a job in a transaction that holds an advisory lock, and only when no job is running.
- **Drained with `after()`** by the route that queued the job. The status poll also nudges the queue, and the daily cron drains it before its own sync, so a job whose function instance was stopped is picked up again. A running job older than 90 seconds counts as abandoned and is retried, up to three attempts.
- **Failures are visible.** The job stores the sync's result or its error message. The importer polls `GET /api/admin/discord/channel-jobs?ids=…` every 1.5 s and lists every channel it asked for with its link, or the error and a Retry button. Admin → Discord has a new "Channel requests" section listing jobs still running and failures no later job has fixed, so a failure outlives the page that caused it.

Auto-approved rows, feed updates and auto-merges queue their Discord step the same way instead of running it inside the import request.

### B. Votes

**Totals are stored, not counted.** A trigger on `hackathon_votes` maintains `hackathon_vote_totals` (one narrow row per hackathon) on every insert, update and delete, including cascades from deleted users and writes from code that predates this change. Reads take the totals by primary key.

I first put the counters on `hackathons`, as the brief suggested, and rejected it on evidence. Loading 261,000 votes in one statement left `hackathons` (174 rows) at 198 MB, still 198 MB after `VACUUM`, because every vote rewrote that wide, seven-index row. With the side table the same load leaves `hackathons` at 136 kB and the totals table at 13 MB. Normal traffic writes one vote per statement and would not have hit this, but any bulk operation on votes would have damaged the catalog's main table for good.

**A vote is one statement** (`castHackathonVote` in `lib/hackathons/votes.ts`): the rate limiter's bucket, the "listed and not ended" check, the write, and the totals to return are CTEs of one query. The write only happens if the limiter and the check allow it. The voter's id comes from the session claims, so the request makes one round trip in total.

**Signed-out reads share a 30-second cache.** Signed-out visitors cannot vote and all see the same totals, so `getVoteStates` serves them through `unstable_cache`. Signed-in viewers always read live.

**The vote control no longer blocks.** It was already optimistic but ignored clicks while a request was in flight. It now shows every click at once, remembers the latest choice, and sends it when the in-flight request returns if the server does not already have it. A failure rolls back to the last confirmed state.

### C. Database review

`pg_stat_statements` is not installed on this database, so the review used `pg_stat_user_tables`, `pg_stat_user_indexes` and `EXPLAIN`. The statistics have never been reset, so "0 scans" means never used.

**Added:** `cities_lower_name_idx` and `cities_lower_ascii_name_idx`. `resolveCityCoordinates` matches `lower(name) = lower($1)`, which the trigram indexes cannot serve, so every import without coordinates scanned all 69,474 cities (197 sequential scans, 13.4 million rows read to date). On the real database: 17.1 ms → 0.1 ms execution, 43.0 ms → 24.1 ms through the driver.

**Nothing else needed an index.** Every other table has under 400 rows and the planner correctly prefers a sequential scan.

**Recommended, not done** (I was asked not to drop anything):

| Index | Scans | Why it can go |
|---|---|---|
| `hackathon_dates_hackathon_idx` | 0 | Same column as `hackathon_dates_hackathon_unique_idx` |
| `hackathon_locations_hackathon_idx` | 0 | Same column as `hackathon_locations_hackathon_unique_idx` |
| `hackathon_series_slug_idx` | 0 | Same column as `hackathon_series_slug_unique` |
| `hackathons_name_slug_idx` (unique) | 0 | `slug` is already unique on its own |
| `cities_country_code_idx`, `users_role_idx`, `hackathon_submissions_status_idx`, `organization_memberships_status_idx`, `user_hackathons_event_status_user_idx` | 0 | Never used |
| `hackathons_status_idx`, `hackathons_format_idx`, `hackathons_name_trgm_idx`, `hackathon_locations_country_idx`, `hackathon_locations_coordinates_idx` | 0 | Never used; these are agent 1's to judge |

Other findings, outside my three parts:

- **N+1 in the Devpost profile import** (`lib/devpost/import-service.ts`, loop at line 450): per project it calls `createPublishedHackathon` (about ten queries plus a synchronous Discord sync) and then three single-row inserts. The batching used here would apply directly.
- **`getCurrentUserRecord` selects the whole `users` row on every authenticated API call** that uses `getCurrentUserContext`. Routes that only need the id can use `getCurrentUserId()`, as the vote and admin import routes now do.
- **`tags` has had 11,959 sequential scans and holds no rows.** The catalog joins it on every uncached page.
- **Foreign keys without an index** on `hackathon_submissions.approved_hackathon_id` and `.matched_hackathon_id`. Deleting a hackathon scans the table for both. At 399 rows this cannot be measured; worth adding past roughly 10,000.
- **Enable `pg_stat_statements`** so the next review can rank queries by total time.

## Files touched outside my area

- **`lib/hackathons/catalog.ts` (agent 1).** Three hunks in `queryCatalogPage`: the `voteTotals` aggregate subquery is gone, `ups`/`downs` read `hackathon_vote_totals`, and the `leftJoin(voteTotals, …)` line joins that table instead. The import changes from `hackathonVotes` to `hackathonVoteTotals`. The ordering expressions are untouched.
- **`lib/auth.ts`.** Adds `requireAdminUserId()`. Nothing existing changes.
- **`lib/security/rate-limit.ts`.** The limiter's upsert is exposed as SQL so the vote statement can include it. `consumeRateLimit` behaves as before and now shares that SQL.
- **`tests/integration/local-db.ts`.** `TEST_DATABASE_PROXY_PORT` overrides the proxy port, so four agents could each run a database.
- **`tests/integration/global-setup.ts`.** Applies `docs/perf/4-import-votes-db.sql` after the migrations, because my branch has no migration for it. Delete that block once the migration exists (it is harmless if left: every statement is idempotent).

**For agent 2 (caching):** signed-out vote totals are cached for 30 seconds under the key `hackathon-vote-totals`, with no tag. A finished Discord job that created or reused a channel calls `revalidateHackathonCaches()`, as does clearing a dead image. Import revalidation is unchanged.

## How it was measured

**Handler timings** (first six rows of the table): `tests/perf/*.bench.ts`, run before any code changed and again after, same machine, same command:

```
docker compose -f docker-compose.test.yml up -d --wait
PERF_OUT=out.jsonl pnpm exec vitest run --config vitest.perf.config.ts
```

The harness calls the real route handlers (`POST /api/admin/hackathon-imports`, `POST /api/admin/hackathons/[id]/discord-channel`, `PUT`/`DELETE /api/hackathons/[id]/vote`) against the throwaway local database and counts every HTTP request the Neon driver makes. 12 runs per case, 3 for the 20-card cases. Stubbed: Clerk (a fixed signed-in admin), `after()` (collected, then run and timed separately as background work), `revalidateTag`, the Discord REST client (an in-memory guild, 150 ms per call, never the network), and image vetting (a 120 ms sleep).

- **No test hackathons were left in any real database.** Writes only ever went to the local Docker database, which `tests/perf/setup.ts` enforces by host name. Its catalog tables were copied from the `.env.local` database with read-only `SELECT`s (174 hackathons, 69,474 cities; no user rows).
- **Why not HTTP for these:** the admin and vote routes need a Clerk session, and I had no way to sign in as an admin without creating sessions on the real Clerk instance.
- **Round-trip cost.** The local proxy opens a new Postgres connection per request, which costs 67 ms (p95 69). The real database measured 24.8 ms (p95 27.9) per round trip from this machine and 34.1 ms for a batch of five statements. Vercel's `iad1` is closer to Neon than this laptop is.
- **Node version.** Everything ran under Node 26.4.0, the local default; Vercel runs an older release. None of the changes here depend on requests to the database running in parallel (the gain comes from sending fewer of them), so the before/after comparison should carry over, but it was not re-measured under Vercel's Node version.
- **Discord latency** was measured with reads only: `GET /guilds/:id` 135 ms median (104–225), `GET /guilds/:id/channels` 168 ms median (117 minimum; one call of 12 blocked 56.8 s on a rate limit). No channel was created, renamed or deleted. Real writes are likely slower than the 150 ms the stub uses.
- **Vote volume** for the handler and local `EXPLAIN` numbers is synthetic: 1,500 voters on each of 174 hackathons, about 260,000 votes.

**HTTP timings** (last two rows): `pnpm build && pnpm start -p 3104` against the `.env.local` database, 30 sequential `GET`s after 3 warm-ups, before and after. The catalog page itself is cached in both; what changed is the per-request vote query. After the change that query runs once per 30 seconds; a request that misses costs one round trip, as before.

**`EXPLAIN (ANALYZE, BUFFERS)`**, execution time, median of 5; wall time through the HTTP driver, median of 15:

| Query | Database | Before | After |
|---|---|---|---|
| Vote totals for 30 cards | real (3 votes) | 0.1 ms, 26.1 ms wall | 0.1 ms, 23.9 ms wall |
| Vote totals for 30 cards | local (260k votes) | 5.2 ms (bitmap scan of 45,000 index entries, then `HashAggregate`) | 0.2 ms (30 primary-key lookups) |
| "Top voted" ordering | real | 0.5 ms, 28.3 ms wall | 0.5 ms, 27.8 ms wall |
| "Top voted" ordering | local | 11.1 ms (parallel index-only scan of all 260k votes) | 0.6 ms |
| City lookup | real | 17.1 ms, 43.0 ms wall (`Seq Scan on cities`) | 0.1 ms, 24.1 ms wall (`BitmapOr` of the two new indexes) |
| City lookup | local | 15.4 ms | under 0.1 ms |

**Tests.** `pnpm typecheck`, `pnpm lint` (one warning, already on `main`, in `components/hackathon-search.tsx`), `pnpm test` (264 passed) and `pnpm test:integration` (38 passed, 26 of them new) all pass. The new integration tests cover: batched imports (shared organization, repeated feed id, in-request duplicate, slug collision, dead image, deferred work), the queue (double request, concurrent workers never overlapping, stored result and error, abandoned job retried then failed), the trigger (set, switch, clear, cascades, direct SQL, concurrent voters, closed, unlisted, rate limit), and the shared rate limiter.

## DDL applied to DB

Applied on 24 Nov 2026 to the database in `.env.local` (PostgreSQL 18.7, likely production), one statement at a time, in this order. This is `docs/perf/4-import-votes-db.sql` verbatim. It is additive and idempotent, and I ran it twice on the local database to confirm that. Statements are separated by the Drizzle breakpoint marker so the file can be a migration body as is.

```sql
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
```

After applying: all four new indexes are valid, and the backfill produced 3 totals rows (3 up, 0 down) matching the 3 rows in `hackathon_votes`.

I also ran one block on that database to confirm the trigger works on PostgreSQL 18. It inserts, switches and deletes one vote and then raises, so the whole transaction rolls back. It reported `before=0/0 after-insert=1/0 after-switch=0/1 after-delete=0/0`, and the table held the same 3 votes afterwards:

```sql
DO $$
DECLARE u uuid; h uuid; t0 text; t1 text; t2 text; t3 text;
BEGIN
  SELECT id INTO h FROM hackathons WHERE published_at IS NOT NULL ORDER BY created_at LIMIT 1;
  SELECT us.id INTO u FROM users us WHERE NOT EXISTS (SELECT 1 FROM hackathon_votes v WHERE v.user_id = us.id AND v.hackathon_id = h) LIMIT 1;
  SELECT coalesce((SELECT upvote_count || '/' || downvote_count FROM hackathon_vote_totals WHERE hackathon_id = h), '0/0') INTO t0;
  INSERT INTO hackathon_votes (user_id, hackathon_id, value) VALUES (u, h, 1);
  SELECT upvote_count || '/' || downvote_count INTO t1 FROM hackathon_vote_totals WHERE hackathon_id = h;
  UPDATE hackathon_votes SET value = -1 WHERE user_id = u AND hackathon_id = h;
  SELECT upvote_count || '/' || downvote_count INTO t2 FROM hackathon_vote_totals WHERE hackathon_id = h;
  DELETE FROM hackathon_votes WHERE user_id = u AND hackathon_id = h;
  SELECT upvote_count || '/' || downvote_count INTO t3 FROM hackathon_vote_totals WHERE hackathon_id = h;
  RAISE EXCEPTION 'ROLLED BACK ON PURPOSE: up/down before=% after-insert=% after-switch=% after-delete=%', t0, t1, t2, t3;
END $$;
```

Everything else I ran there was read-only: statistics queries, `SELECT`s to copy catalog tables, and `EXPLAIN ANALYZE` of `SELECT` statements.

## Risks

1. **Not clicked through by a person.** The import and channel flows were exercised through their handlers and the integration suite, not in a browser with a real admin session, and `after()` ran through a stand-in. Someone should import one card and approve its channel before this ships.
2. **Deploy order.** The new code needs the new tables. Code deployed before the migration fails on votes and imports. The reverse is safe: the code on production today works against the migrated database, which is the state the `.env.local` database is in now.
3. **Work deferred with `after()` can be lost** if the function instance is stopped. A lost Discord job stays queued and is picked up by the next poll, import, approval or the daily cron. A lost image check leaves a dead image URL on the card, and the card has no `onError` fallback.
4. **Discord jobs are serial by design.** One slow job (I saw Discord hold a call for 57 s) delays the ones behind it. The importer shows them as "being set up" until they finish and stops polling after 3 minutes; Admin → Discord lists whatever is still open.
5. **The channel preview can be wrong for 30 seconds** about a channel made by hand on Discord in that window, or when Discord takes over 1.5 s. It then says "create" and the sync reuses the channel. The old preview had the same fallback when Discord failed.
6. **A batch is all or nothing.** One row that fails to write fails every write of that request. The importer retries a failed auto-approve chunk one card at a time. If two imports write the same event at once, the loser's transaction rolls back. When nothing of that request had been written yet, which is the usual case, it is re-run once and reports the event as already imported; otherwise the request fails with the database's error.
7. **`TRUNCATE hackathon_votes` does not fire the trigger.** Nothing in the app does this. If it is ever done by hand, re-run the backfill `DO` block, which is also the reconciliation query.
8. **Signed-out visitors see vote totals up to 30 seconds old.**
9. **The totals a vote returns are computed** (totals before, plus this vote) rather than re-read. If someone else votes in the same instant the response can be off by their vote until the next read.

## Follow-ups for the parent

- **Generate the migration.** `lib/db/schema.ts` adds `hackathon_vote_totals`, `discord_channel_jobs` (two indexes, two checks) and two expression indexes on `cities`. Use `docs/perf/4-import-votes-db.sql` as the migration's SQL in place of what `drizzle-kit` generates: the generated statements are not idempotent and would fail on the database where this is already applied, and the trigger, its function and the backfill cannot be generated at all. The neon-http migrator runs statements one at a time outside a transaction, so `CREATE INDEX CONCURRENTLY` is fine there. The database already has migration 0039 from `main`; the new migration's `when` must be later.
- Then remove the block in `tests/integration/global-setup.ts` that applies the file, and the file if it is no longer wanted.
- If production is a different database from the one in `.env.local`, it needs the same SQL before the deploy.
- The benches live in `tests/perf/` with `vitest.perf.config.ts`. They are not part of `pnpm test`. Drop them if the PR should not carry them.
