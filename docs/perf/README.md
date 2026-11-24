# Site performance report (Nov 24 2026)

Four agents worked in parallel, one per area, and their branches were merged into
`t3/site-performance` on top of `main` (`0de1908`). Each area has its own detailed report,
which covers method, raw numbers, DDL and risks:

| # | Area | Report |
|---|---|---|
| 1 | Canada / U.S. search query | [1-country-search-query.md](1-country-search-query.md) |
| 2 | Homepage → Hackathons navigation | [2-instant-hackathons-nav.md](2-instant-hackathons-nav.md) |
| 3 | Site-wide cost and load time | [3-site-wide-efficiency.md](3-site-wide-efficiency.md) |
| 4 | JSON import, Create New Channel, votes, DB indexes | [4-import-votes-db.md](4-import-votes-db.md) |

## How the timings were taken

- All page and API numbers come from production builds (`pnpm build && next start`), not `next dev`.
- Each figure is a median over 10–20 runs after warm-up. The per-area reports also give p95 and max.
- **"Before"** was measured on each agent's baseline commit (`0c106bc`), before it changed anything.
- **"After (area)"** is that agent's branch on its own.
- **"After (merged)"** is this PR's branch, re-measured once the four branches were merged. It ran under Node 24.22.3, the Vercel runtime, on port 3110, against the same Neon database as the agents (`ep-orange-block`).
- **Latency.** This machine is about 24 ms from Neon, and a Vercel function in `iad1` is about 1–2 ms away. So the absolute savings from removing database round trips are overstated locally. The round-trip counts and function-invocation counts carry over to production exactly.
- **Noise.** The agents benchmarked at the same time on one machine, so their p95 values are noisy. The merged-branch numbers were taken with nothing else running.

## Headline results

### 1. Searching for Canada or the U.S.

| Request | Before | After (area) | After (merged) |
|---|---|---|---|
| `GET /api/hackathons?countries=CA`, new filter combination | 133.9 ms | 25.2 ms | — |
| `GET /api/hackathons?countries=US`, new filter combination | 112.7 ms | 27.6 ms | — |
| Canada + text search, new combination (15 different queries) | 110.6 ms | 25.3 ms | **1.5 ms** |
| `GET /api/hackathons?countries=CA` (warm) | — | — | **2.2 ms** |
| `GET /api/hackathons?countries=US` (warm) | — | — | **1.8 ms** |
| Browser: type a search → results rendered | 163.5 ms | 50.6 ms | — |
| Database round trips per search | 2–3, one after another | 0 | 0 |

**Why it's faster:** the SQL itself was already under 1 ms. The time went to two or three
sequential Neon round trips per filter combination, each cached under its own key. The
whole catalog (tags, Discord link, vote totals) is now one cached snapshot loaded in a
single statement, and every search filters it in memory in about 30 µs.

**Why the merged branch is even faster:** agent 4 caches the signed-out vote overlay for 30 s.
That removes the last per-request query, about 26 ms of agent 1's result.

### 2. Homepage → Hackathons

| Metric | Before | After (area) | After (merged) |
|---|---|---|---|
| Click → cards visible (warm) | 763 ms | 78 ms | **81 ms** |
| Click → cards visible, with +100 ms network latency | 1012 ms | 70 ms | — |
| Click → cards visible, cold server | 930 ms | 74 ms | — |
| `/hackathons` TTFB, warm / cold | 34.6 / 375.6 ms | 3.2 / 12.5 ms | **2.0 ms** warm |
| `/hackathons` route type | `ƒ` dynamic | `○` static (ISR) | `○` static, revalidates every 30 s |
| First-load JS on `/hackathons` (gzip) | 459.8 KB | 417.9 KB | — |

**Why it's faster:**
- `/hackathons` is now prerendered, so the homepage's links prefetch it in full and the click needs no server round trip.
- Per-viewer state (stages, own vote) and the nav's signed-in state load in the browser after the cards appear.
- `/hackathons` is excluded from the Clerk proxy.

### 3. Site-wide

| Metric | Before | After (area) |
|---|---|---|
| JS before hydration on `/` (gzip) | 273.3 KB | 221.7 KB |
| JS before hydration on `/organizer` (gzip) | 399.0 KB | 276.3 KB |
| Detail-page prefetches while scrolling the whole catalog | 190 | 0 (now on hover/focus only) |
| `/p/[username]` | a function call per view, 7.1 ms | static (ISR), 0.8 ms |
| `/hackathons/[slug]`, first view | 83.1 ms | 31.4 ms |
| `/my` | 61.7 ms | 30.2 ms |
| `/my`, first request after 6 s idle | 173.9 ms | 32.3 ms |
| `/account`, full response | 215.6 ms | 94.3 ms |
| Auth check on a mutation (`PATCH …/track`) | 27.5 ms | 2.0 ms |
| `/about` TTFB (merged) | — | 0.9 ms |

**What changed:**
- **Clerk proxy:** it no longer runs on `/about`, `/corporate`, `/discord`, `/p/*`, `/api/geo`, `/api/cities/search`, `/api/cron/*` or `/hackathons`. Each excluded request is one fewer billed invocation.
- **Analytics and errors:** Sentry and PostHog now load when the browser is idle.
- **Auth:** the session's claims replace a `users` query on every auth check.
- **Database connections:** a keep-alive connection to Neon removes the TLS handshake after an idle spell.
- **Fewer queries:** `/my` and the detail page now run one query each.

### 4. Import, Create New Channel and votes

| Action | Before | After | DB round trips |
|---|---|---|---|
| Import one card (Yes) | 1557 ms | 175 ms | 17 → 2 |
| **Create New Channel** | 2017 ms | **158 ms** (returns 202; the Discord work runs in the background) | 10 → 2 |
| 20 auto-approved cards | 56.1 s (20 requests) | 0.22 s (1 request) | 420 → 2 |
| 20 unchanged re-imports | 3230 ms | 155 ms | 42 → 2 |
| Cast or switch a vote | 344 ms | 69 ms | 5 → 1 |
| Read vote totals with 260k synthetic votes | 5.2 ms | 0.2 ms | — |
| City lookup during import (real DB) | 17.1 ms | 0.1 ms | — |

**How these were measured:** handler timings against a local Docker Postgres, with Discord,
Clerk and image fetches stubbed. Discord itself still takes about 1.8 s per channel. That
time now happens after the response, and the import UI polls and shows the link, or the
error with a Retry button.

**Vote counts:**
- **Storage:** totals live in `hackathon_vote_totals`, which a trigger on `hackathon_votes` keeps in sync. The catalog therefore never runs a `GROUP BY` over votes.
- **Why a side table:** a version that added count columns to `hackathons` was rejected because it bloated that table to 198 MB under vote churn.

## Database changes

All of these are in migration `drizzle/0040_perf_vote_totals_channel_jobs.sql`. Every
statement is additive and safe to re-run.

| Object | Purpose |
|---|---|
| `hackathon_vote_totals` + trigger `hackathon_votes_sync_totals` + backfill | Vote counts kept up to date as votes change, read by primary key |
| `discord_channel_jobs` + partial unique index on the pending row per hackathon | Background channel queue; a double click can't create two channels |
| `cities_lower_name_idx`, `cities_lower_ascii_name_idx` | Exact city matching during import |

**Where it's applied:**
- **`ep-orange-block`** (the DB the agents used): applied by hand on Nov 24, and recorded as migration 0040 by `pnpm db:migrate`. The backfilled totals match the existing votes (3 = 3).
- **`ep-dark-bread`** (production): **not migrated.** Its journal stops at 0037, so `pnpm db:migrate` there will also apply 0038 and 0039 from earlier PRs.

**Unused or duplicate indexes:** listed in report 4 as recommendations only. None were dropped.
