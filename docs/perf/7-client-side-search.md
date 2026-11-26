# Perf 7: catalog searches answered in the browser

Branch `t3/client-side-search`. Scope: how a search on /hackathons gets its
results (`components/hackathon-search.tsx`, `components/hackathon-catalog.tsx`,
the new `lib/hackathons/catalog-client.ts` and
`app/api/hackathons/catalog/route.ts`).

## Headline

After report 1, a search cost about 2 ms on the server. The visitor still waited
for a request to the function in `iad1`, routed through Clerk's proxy, on every
search, region tab, sort change and infinite-scroll page. Now the browser
downloads the whole public catalog once, as a static CDN file, and answers all
of those itself.

| Click a region tab → new cards on screen (median) | Before | After |
| --- | --- | --- |
| Desktop, no added latency (localhost) | 16.5 ms | 16.4 ms |
| Desktop, +100 ms RTT, 10 Mbps | 123.6 ms | **15.4 ms** |
| Phone: 4× CPU, +150 ms RTT, 5 Mbps | 214.5 ms | **72.2 ms** |
| First tab, clicked the moment the page loads (+100 ms RTT) | 340.8 ms | **19.0 ms** |
| First tab, clicked the moment the page loads (phone) | 554.2 ms | **100.9 ms** |
| Requests per search (signed out) | 1 function invocation + proxy | **0** |

A shared or reloaded filtered link (`/hackathons?countries=Canada`) is a little
faster too: 911.8 → 825.9 ms with +100 ms RTT, and 1631.7 → 1531.4 ms on the
phone profile. It still has to load the page itself, so the gain is smaller.

## What changed

**A static catalog file.** `GET /api/hackathons/catalog` returns the cached
snapshot from report 1 unfiltered (`getPublicCatalogSnapshot()`). It is
`force-static` with `revalidate = 600` and reads nothing from the request, so it
is prerendered and served from the CDN like the page. It inherits the
`hackathon-catalog` cache tag (checked in `.next/server/.../catalog.meta`), so
`revalidateHackathonCaches()` refreshes it together with the page. `proxy.ts`
excludes it from Clerk, so fetching it never invokes a function.

**Searching in the browser.** `lib/hackathons/catalog-client.ts` downloads the
file once per tab and runs the same `selectCatalogPage()` the API runs, with the
same filter normalization. `HackathonSearch` gets a `searchLocally` prop:

- If the file has already arrived, the new page is put on screen in the same
  click event, with no loading state in between.
- If it hasn't arrived yet, the search waits for the download that is already
  in flight.
- If the file can't be had (offline, or built without a database), the search
  falls back to `/api/hackathons` exactly as before.

**When the file is fetched.**

- Plain /hackathons: right after hydration, at `priority: "low"`, so it doesn't
  compete with the first covers.
- Filtered URL: the inline boot script (`CATALOG_URL_BOOT_SCRIPT`) starts the
  download while the HTML is still parsing, and the client adopts that promise.
- A tab open longer than 10 minutes keeps using its copy and re-downloads it in
  the background on its next search.

**Viewer state.** Cards rebuilt by a local search keep what the page already
knows about the viewer:

- Earlier `/api/hackathons/card-state` answers, and stage changes made on the
  page since, are both reapplied to the rebuilt cards.
- Votes need no extra handling, because the vote control already remembers
  confirmed votes across remounts.
- Only ids the page hasn't asked about are sent to card-state, and only for
  signed-in visitors. The cards never wait for that answer.

**Equivalence.** On the real catalog (310 entries, `ep-orange-block`), the
browser's results matched the API's on all 114 comparisons. Those covered 19
filter sets (Canada, U.S., both, every region preset, name, name + country,
format, each flag, five date windows, no match) × both sorts × offsets 0/30/60,
comparing ids, order, `isPast` and `hasMore`.

## Method

- Production builds (`next build && next start`) under Node 24, the Vercel
  runtime. `main` at `da1f533` ran on port 3119, this branch on port 3120.
- Both builds read `ep-orange-block` read-only. The DB in `.env.local`
  (ep-dark-bread) has no `hackathon_vote_totals` table (migration 0040), so
  `main` can't prerender the catalog against it.
- Playwright Chromium. Network and CPU were set through CDP, and remote covers
  were blocked so image downloads don't skew the timings.
- **"Tab click"**: click → the grid's cards differ and nothing is
  `aria-busy`, measured to the next animation frame. The tab cycle was North
  America → Online → International → International (clears), with 4 clicks per
  load and 8 loads per profile after one warm-up (n = 32).
- **"First tab right after load"**: clicked on the `load` event, before the file
  has necessarily arrived (n = 8).
- **"Filtered URL load"**: navigation start → filtered cards visible (n = 8).
- Two other agents were building and benchmarking on this machine at the same
  time. The p95 values are noisy; the medians held steady between the smoke run
  and the full run.

Full results:

| Profile | Scenario | Before median / p95 | After median / p95 |
| --- | --- | --- | --- |
| local | tab click | 16.5 / 23.7 | 16.4 / 30.1 |
| local | first tab after load | 18.3 / 26.5 | 20.9 / 37.9 |
| local | filtered URL load | 158.3 / 172.5 | 142.2 / 164.0 |
| +100 ms RTT | tab click | 123.6 / 128.7 | 15.4 / 27.2 |
| +100 ms RTT | first tab after load | 340.8 / 345.4 | 19.0 / 22.9 |
| +100 ms RTT | filtered URL load | 911.8 / 914.0 | 825.9 / 831.5 |
| phone | tab click | 214.5 / 227.2 | 72.2 / 148.0 |
| phone | first tab after load | 554.2 / 575.6 | 100.9 / 111.5 |
| phone | filtered URL load | 1631.7 / 1660.1 | 1531.4 / 1546.9 |

**The local numbers don't change, and that is expected.** On localhost the API
answers in a couple of milliseconds, so there is nothing to remove. The
latency profiles stand in for real visitors, and they still understate the
"before" case: they include neither a function cold start nor Clerk's
token-refresh round trip, which a real search could hit.

## Cost

- **Extra download per catalog visit:** the file is 385 kB of JSON for 310
  hackathons. Compressed, that is 101 kB gzip (what `next start` sends), or
  75–92 kB brotli (what Vercel's CDN sends). Descriptions are 115 kB of the raw
  size. Every visitor downloads it, including those who never search. For
  scale, that is less than one organizer cover image today.
- **Function invocations:** signed-out searches now invoke nothing, where each
  used to invoke one (plus the proxy). Signed-in visitors make one
  card-state request per page of cards they haven't seen yet, in the
  background.

## Risks

- **The file grows with the catalog.** It is about 330 B brotli per hackathon,
  so roughly 330 kB at 1,000 listed events. The data-cache ceiling from report 1
  (about 1,600 entries, Sentry warning at 800) comes first. Well before that,
  split the file, for example by leaving descriptions out of it and loading
  them per page.
- **Vote totals in search results** are as of the file's last regeneration (up
  to 10 minutes old) for signed-out visitors. The API's vote overlay was cached
  for 30 seconds. The static page's own cards already had the file's freshness.
  Signed-in visitors still get live totals through card-state.
- **Stale after an edit:** a tab that downloaded the file keeps it for up to 10
  minutes. The API answered from the same 10-minute snapshot, so this is no
  worse than before.

## What is left

- **On the phone profile, the remaining ~70 ms is React mounting about 30
  cards** at 4× CPU. Search no longer waits on the network, so card render cost
  is now the bottleneck (see the JS bundle report, 6).
- **The page itself** still dominates a filtered link's ~0.8–1.5 s. That is the
  JS bundle and covers work (reports 5 and 6).
