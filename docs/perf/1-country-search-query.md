# Perf 1: country filter and the catalog search query

Branch `t3/speed-country-search`. Scope: the catalog/search query path
(`lib/hackathons/catalog*.ts`, `app/api/hackathons/route.ts`, the fetching part
of `components/hackathon-search.tsx`) and the indexes behind it.

## Headline

Filtering to Canada or the U.S. was never slow in SQL: the statements execute
in under 1 ms. It was slow because each filter combination ran its own chain
of 2–3 sequential database round trips the first time it was asked for, and
was then cached under its own key for ten minutes.

The catalog is now loaded once, in one statement, into a single cached
snapshot, and every search is answered from that snapshot in memory.

| Search nobody has run in the last 10 min | Before | After |
| --- | --- | --- |
| API, Canada filter (TTFB, median) | 133.9 ms | 25.2 ms |
| API, U.S. filter | 112.7 ms | 27.6 ms |
| API, text + country | 110.6 ms | 25.3 ms |
| Page `/hackathons?q=…&countries=…` (TTFB) | 156.5 ms | 30.9 ms |
| Browser, name search + North America, request → rendered | 163.5 ms | 50.6 ms |
| Database round trips for the catalog part | 2–3 sequential | 0 |

A search that was already cached costs the same as before (about 26 ms; see
"What is left").

## What I found

**How the country filter was applied.** Server-side, as
`hackathon_locations.country IN (…)` on an exact display name, joined to
`hackathons` on `hackathon_id`. No `ILIKE`, no join to `cities`, nothing
computed in JS. The name search was `hackathons.name ILIKE '%…%'`.

**Round trips, not SQL time, were the cost.** One catalog page issued:

1. the main query (hackathons + location + dates + series + vote totals),
2. when the page held a past edition of a recurring series, a second query
   asking whether that series has a current edition,
3. tags and Discord links, two requests in parallel.

That is 3–4 HTTP requests in 2–3 sequential waves. Each wave is a full Neon
HTTP round trip (about 25 ms from this machine), while the statements
themselves total 0.6–0.8 ms of execution. The Canada filter was the worst case
because Canada's page reaches the past recurring editions and so triggers
step 2.

**Caching was per filter combination.** `unstable_cache` keyed the page on
name, countries, format, flags, date bounds, limit, offset and sort. Every
combination went cold on its own ten-minute clock, and every distinct search
text created a new cache entry that was almost never read again.

**Indexes are not the problem at this size.** The tables behind the query hold
178 hackathons, 178 locations, 179 date rows, 234 series and 90 Discord
channels. Postgres seq-scans and hash-joins all of them, which is the right
plan. I forced the index plans to check:

| Statement | Default plan | Forced index plan |
| --- | --- | --- |
| Canada filter | 0.278 ms (seq scans) | 0.262 ms (`hackathon_locations_country_idx`) |
| `name ILIKE '%hack%'` | 0.121 ms (seq scan) | 4.175 ms (`hackathons_name_trgm_idx`) |

`pg_stat_user_indexes` agrees: `hackathon_locations_country_idx`,
`hackathons_name_trgm_idx`, `hackathons_status_idx` and `hackathons_format_idx`
all show `idx_scan = 0`. So I added no index; see "DDL applied to DB".

**Over-fetching.** The main query selected only columns the card uses. The
payload is dominated by `short_description` (33 kB of the 88 kB snapshot
response) and `image_url` (13 kB), both rendered on the card.

**Client side.** Searches are sent on submit, on a region tab, on a sort
change and on infinite scroll; nothing fires per keystroke, so there is
nothing to debounce. A superseded request was ignored when it returned but
never cancelled.

## What changed

**One snapshot, one statement** (`lib/hackathons/catalog.ts`,
`loadCatalogSnapshot`). A single `SELECT` loads every hackathon the public
catalog can list, with tags (`array_agg`) and the Discord channel as correlated
subqueries and the vote totals as a join. It takes no filter arguments, so it
is one cache entry (`unstable_cache`, same tag and 10-minute window as before).

**Filtering, sorting and paging in memory** (new
`lib/hackathons/catalog-snapshot.ts`, `selectCatalogPage`). Country, name,
format, the three flags, the date range, both sorts and the offset/limit are
applied to the cached snapshot. This is pure code with no DB access, 25–36 µs
per search on 97 entries. `getPublicHackathonCatalog` keeps its signature, so
the page and the API route are unchanged.

**Visibility of past recurring editions** is now decided over the whole
catalog before filtering, and against the request's clock instead of the
cached one (`catalog-visibility.ts`: `seriesWithCurrentEdition` replaces
`pastRecurringSeriesIds`). This removes the follow-up query.

**Request cancellation** (`components/hackathon-search.tsx`). A new search
aborts the request it replaces with an `AbortController`, and leaving the page
aborts whatever is in flight.

Old and new were compared on the live data before the old code was removed:
23 filter combinations (countries, name, format, flags, date windows, both
sorts, pages 1–4) returned identical cards in identical order. The API
response sizes in the tables below are byte-identical before and after.

## Timings

Same machine, same network, same database for both columns. n = 15 unless
stated, so p95 equals the maximum. All times in ms.

### SQL and round trips (app's Neon HTTP driver, no Next cache)

Before, per catalog page on a cache miss. "SQL exec" is the sum of
`EXPLAIN (ANALYZE, BUFFERS)` execution time over every statement the page
issued.

| Scenario | HTTP requests | Sequential round trips | Wall median | Wall p95 | SQL exec median | SQL plan median |
| --- | --- | --- | --- | --- | --- | --- |
| Unfiltered | 3 | 2 | 88.7 | 204.5 | 0.70 | 0.90 |
| Canada | 4 | 3 | 110.1 | 193.2 | 0.59 | 1.20 |
| United States | 3 | 2 | 111.5 | 552.6 | 0.55 | 0.94 |
| Text + country (`q=hack`, U.S.) | 3 | 2 | 86.6 | 89.1 | 0.60 | 1.01 |
| North America tab (CA + US, in person) | 3 | 2 | 110.3 | 199.3 | 0.59 | 0.97 |
| Unfiltered, top voted | 3 | 2 | 107.9 | 215.7 | 0.84 | 1.25 |

After. The snapshot load happens once per cache lifetime, not per search:

| Step | HTTP requests | Sequential round trips | Wall median | Wall p95 | SQL exec median | SQL plan median |
| --- | --- | --- | --- | --- | --- | --- |
| Load snapshot (97 entries, 88 kB response) | 1 | 1 | 83.6 | 245.9 | 1.60 | 0.75 |

| Scenario, from the cached snapshot | Round trips | Select median | Select p95 |
| --- | --- | --- | --- |
| Unfiltered | 0 | 0.036 | 0.066 |
| Canada | 0 | 0.025 | 0.030 |
| United States | 0 | 0.025 | 0.026 |
| Text + country | 0 | 0.036 | 0.045 |
| North America tab | 0 | 0.033 | 0.069 |
| Unfiltered, top voted | 0 | 0.030 | 0.041 |

Bare Neon round trip (`select 1`) from this machine: 26.2 ms median before,
24.3 ms after.

The snapshot statement executes in 1.6 ms, more than any single old statement,
because it does all the work at once. Its 84 ms wall time is one round trip
plus downloading 88 kB: response headers arrive at about 30 ms and the body
takes the rest. Neon's HTTP endpoint sent it uncompressed. From a Vercel
function in the database's region the download should be a few milliseconds,
but I could not measure that from here.

### API `/api/hackathons` (production build, `curl -w`, signed out)

"Fresh" is a filter combination the server has not seen; "repeat" is the same
URL again.

| Scenario | Before TTFB median | Before p95 | After TTFB median | After p95 |
| --- | --- | --- | --- | --- |
| Unfiltered, fresh | 109.8 | 248.0 | 27.0 | 29.2 |
| Canada, fresh | 133.9 | 150.1 | 25.2 | 30.8 |
| United States, fresh | 112.7 | 197.0 | 27.6 | 88.7 |
| Text + country, fresh | 110.6 | 229.1 | 25.3 | 29.8 |
| North America tab, fresh | 115.9 | 421.6 | 26.7 | 76.0 |
| Unfiltered, repeat | 27.3 | 74.0 | 28.4 | 128.1 |
| Canada, repeat | 26.1 | 31.9 | 25.8 | 111.0 |
| United States, repeat | 26.5 | 34.9 | 26.9 | 32.5 |
| Text + country, repeat | 26.0 | 28.7 | 25.7 | 27.5 |
| North America tab, repeat | 27.8 | 33.2 | 26.4 | 28.2 |

Total time is within 0.6 ms of TTFB in every row (local server, small body).
The "repeat" rows did not improve; the differences are noise.

### Page `/hackathons` (production build, `curl -w`, signed out)

| Scenario | Before TTFB median | Before p95 | After TTFB median | After p95 |
| --- | --- | --- | --- | --- |
| Unfiltered, repeat | 33.3 | 38.9 | 33.8 | 37.6 |
| `?countries=Canada`, repeat | 30.4 | 83.3 | 30.1 | 75.3 |
| `?countries=United States`, repeat | 31.3 | 39.0 | 30.7 | 32.8 |
| Text + country, repeat | 30.1 | 98.5 | 29.4 | 32.1 |
| North America tab, repeat | 31.8 | 40.3 | 31.3 | 33.9 |
| `?q=<new term>&countries=Canada&countries=United States`, fresh | 156.5 | 447.8 | 30.9 | 86.8 |

### Browser (Playwright, Chromium, production build)

Measured inside the page from the search request starting to the grid having
re-rendered.

| Scenario | Before fetch median | Before rendered median / p95 | After fetch median | After rendered median / p95 |
| --- | --- | --- | --- | --- |
| North America tab toggled on/off (repeat) | 39.5 | 80.8 / 131.0 | 32.1 | 72.6 / 131.7 |
| Name search with North America active (fresh term each run) | 137.9 | 163.5 / 349.4 | 31.1 | 50.6 / 78.3 |

### Empty cache on a freshly started server

The worst case: a new process, an empty data cache, and the first search.
Twelve restarts each, cache directory deleted before each start, route module
pre-loaded with a request that fails validation, then one Canada-filtered API
request.

| | Median | Min | Max |
| --- | --- | --- | --- |
| Before | 228.1 | 220.5 | 457.7 |
| After | 199.4 | 187.9 | 541.2 |

Both include the process's first TLS connection to Neon and to Clerk, which is
why they are far above the warm numbers. The gain here is small (about 29 ms,
one round trip). The larger effect is that this cost is now paid once per
cache lifetime instead of once per filter combination.

## Method

```sh
# Query level (read-only; prints round-trip counts and EXPLAIN ANALYZE times)
BENCH_PRINT_PLAN=1 pnpm exec tsx --env-file=.env.local scripts/perf/catalog-bench.ts

# End to end, against a production build
pnpm build && rm -rf .next/cache/fetch-cache && pnpm start -p 3101
node scripts/perf/catalog-http-bench.mjs
node scripts/perf/catalog-click-bench.mjs
```

- `catalog-bench.ts` wraps `fetch` to count requests to Neon and to detect
  which ran sequentially, then re-runs each captured statement under
  `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` with the same parameters.
- "Before" numbers came from the same harness pointed at a frozen copy of the
  old `queryCatalogPage` (not committed), and from a production build of
  commit `0c106bc`.
- A "fresh" API request adds a random hour-aligned `startsAfter` between 1900
  and 1990. That changed the old cache key without changing which rows match
  (no public hackathon lacks dates), so each run was a guaranteed cache miss
  with an unchanged result. The page takes its date filter as a named period,
  so its fresh row uses a different name search per run instead.
- The empty-cache table was produced with a shell loop (restart, clear
  `.next/cache/fetch-cache`, two `?limit=abc` requests, one timed request).
- The database is the one `DATABASE_URL` in `.env.local` points at: a Neon
  endpoint named `ep-orange-block-…` in us-east-1, Postgres 18.7. The
  `ep-dark-bread-…` URL in that file is commented out, so these timings were
  not taken on the endpoint the project notes call production.
- Timings are signed-out. I had no Clerk session to measure a signed-in
  request, which adds one more query (the user's tracked hackathons) in
  parallel with the vote query.

## DDL applied to DB

None. No statement that changes the database was run; everything issued was
`SELECT` or `EXPLAIN`. `lib/db/schema.ts` is unchanged, so there is nothing
for the combined migration to pick up from this branch.

The index experiment above is why: at these table sizes an index plan is no
faster than a sequential scan, and with the snapshot design the country and
name filters no longer run in SQL at all.

## Behaviour changes

- **A country filter no longer returns online events.** The old SQL matched
  the raw location country, so an online event whose location row says "United
  States" came back for a U.S. filter, and the browser's own re-filter then
  hid it (cards for online events carry no country). The server now applies
  the same rule as the browser, so pages are not shortened by hidden cards.
  One published row is affected and it is not currently in the visible
  catalog.
- **Filters can only narrow the catalog.** The "latest past edition of a
  recurring series" rule used to be applied to each fetched page after
  filtering. A filter that excluded the latest edition could therefore surface
  an older one. It is now applied to the whole catalog first.
- **Pages are full and `hasMore` is exact.** Rows hidden by the past-edition
  rule were dropped after the `LIMIT`, which could shorten a page.
- **Name search is a literal substring.** `%` and `_` typed into the search
  box were unescaped `ILIKE` wildcards. They now match themselves.
- **"Has this event ended" uses the request's clock.** It used to be frozen
  into the cached page for up to ten minutes.
- **Date bounds are exact.** They were rounded down to the hour only to
  stabilise the old cache key.
- **One cache entry instead of many.** After an admin edit, the first request
  of any kind refreshes the catalog for every filter. Before, each cached
  combination had to be requested once more before it refreshed.

Unchanged: the ten-minute window, the cache tag, `revalidateHackathonCaches`,
and "Top voted" ordering using vote totals as of the last snapshot while
cards show live counts.

## Risks

- **Snapshot size.** The snapshot is one cache entry of about 1.2 kB per
  listed hackathon (119 kB today). The data cache rejects entries over 2 MB,
  roughly 1,600 listed hackathons. Past that the search still works but
  reloads the catalog from the database on every request. `loadCatalogSnapshot`
  sends a Sentry warning above 800 entries. The catalog only holds events that
  have not ended plus one past edition per recurring series, and has 97
  entries now, so this is far off, but it is a real ceiling: beyond it the
  filtering should move back into SQL.
- **Per-request CPU.** Each search parses the cached snapshot and filters it.
  Selection is about 30 µs; I did not measure the cache read and JSON parse
  separately, but the warm API rows above include them and did not move.
- **Merge overlap.** `lib/hackathons/catalog.ts` is largely rewritten above
  `loadCardVotes`. `loadCardVotes`, `cardVoteFields` and `applyUserCardState`
  are untouched. If the votes work also edited the vote-totals join inside the
  old `queryCatalogPage`, that hunk will conflict.
- **E2E spec not run.** `tests/e2e/hackathons.spec.ts` appears to describe an
  earlier filter UI (it expects picking a country to send no search request).
  I did not run or change it.

## Files outside the listed scope

- `scripts/perf/catalog-bench.ts`, `catalog-http-bench.mjs`,
  `catalog-click-bench.mjs` (new; the benchmark harness).
- `tests/unit/catalog-snapshot.test.ts`,
  `tests/integration/catalog-snapshot.test.ts` (new),
  `tests/unit/catalog-visibility.test.ts` (updated for the replaced helper).
- `lib/hackathons/discord-cards.ts` is unchanged and still serves `/my`; the
  catalog no longer calls it.

Checks run locally: `pnpm typecheck` clean, `pnpm lint` 0 errors (one
`react-hooks/exhaustive-deps` warning that predates this branch), `pnpm test`
287 passed, `pnpm test:integration` 19 passed against the throwaway Docker
database.

## What is left

- **The remaining ~26 ms on every API request is the vote overlay.**
  `applyUserCardState` runs one grouped query on `hackathon_votes` per request
  (plus the tracked-hackathons query when signed in). That is now the only
  database round trip on the search path, and it is the votes agent's area, so
  I left it alone. Removing or caching it would take a warm search from about
  26 ms to low single digits on this machine.
- **Index cleanup, for the DB-wide review.** These duplicate another index on
  the same column and have `idx_scan = 0`: `hackathon_dates_hackathon_idx` and
  `hackathon_locations_hackathon_idx` (each shadowed by its `_unique_idx`),
  `hackathon_series_slug_idx` (shadowed by `hackathon_series_slug_unique`).
  After this change nothing filters on `hackathon_locations.country` or runs
  `ILIKE` on `hackathons.name` from the catalog path, so
  `hackathon_locations_country_idx` and `hackathons_name_trgm_idx` are only
  worth keeping if another caller uses them; I did not audit other callers.
  Dropping is not additive, so none of this was done here.

## Prod follow-ups

- No migration and no environment change is needed for this branch.
- After deploy, watch for the Sentry warning tagged
  `feature: catalog-snapshot`; it is the early signal for the size ceiling.
- Worth re-running `scripts/perf/catalog-http-bench.mjs` with
  `BASE_URL=<deployment>` once deployed, since the in-region round trip and
  download times will differ from the ones measured here.
