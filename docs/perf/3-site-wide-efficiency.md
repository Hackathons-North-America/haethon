# Performance agent 3: site-wide efficiency

Branch `t3/optimize-site-performance`. Scope: everything outside the catalog SQL (agent 1), the
homepage → `/hackathons` navigation and top nav (agent 2), and the import / Discord-channel / votes
pipeline (agent 4).

## Headline results

| What | Before | After |
| --- | --- | --- |
| JavaScript every page must download before it can hydrate (`/`, gzip) | 273.3 KB | 221.7 KB (−19%) |
| Same, organizer console (`/organizer`) | 399.0 KB | 276.3 KB (−31%) |
| Detail-page prefetch requests while scrolling the whole catalog | 190 | 0 |
| Routes that no longer run the Clerk proxy | — | `/about`, `/corporate`, `/discord`, `/p/*`, `/api/geo`, `/api/cities/search`, `/api/cron/*` |
| `/p/[username]` shared profile | function on every view, 7.1 ms | static (ISR), 0.8 ms |
| `/hackathons/[slug]`, first view of a hackathon | 83.1 ms | 31.4 ms |
| `/my` | 61.7 ms | 30.2 ms |
| `/account` (full response) | 215.6 ms | 94.3 ms |
| Any page, first request after the server sat idle for 6 s (`/my`) | 173.9 ms | 32.3 ms |
| Auth check on a mutation (`PATCH …/track`) | 27.5 ms | 2.0 ms |

Times are medians on a production build, measured locally. Read the
[caveat on absolute numbers](#how-to-read-the-timings) before quoting them: this machine is
about 24 ms from the database, Vercel is about 1–2 ms from it.

## What changed and why

### 1. The proxy (Clerk middleware) no longer runs where nobody reads the session

`proxy.ts`. On Vercel every request the matcher accepts is a billed function invocation, and it
runs *before* the CDN cache is consulted, so a "static" page behind the proxy is never free.
The matcher now skips seven groups of routes that never call `auth()`:

- `/about`, `/corporate`: prerendered. A visit sends the document plus RSC and link-prefetch
  requests for the page itself; all of those are now served by the CDN alone.
- `/discord`, `/p/[username]`: see items 2 and 3.
- `/api/cities/search`: already CDN-cached for a day, but the proxy still ran on every
  autocomplete keystroke, cache hit or not.
- `/api/geo`: only echoes Vercel's geo headers.
- `/api/cron/*`: authenticated by `CRON_SECRET`, not a session.

`tests/unit/proxy-matcher.test.ts` compiles the matcher with Next's own compiler (the same one
`next build` uses) and asserts 47 paths: the ones that must run Clerk, the ones that must not,
and look-alikes such as `/about-us`, `/p`, `/api/geofence` and `/api/cron` that share a prefix
with an excluded route and must still be protected.

`/` is deliberately untouched: the proxy performs the signed-in redirect there, including for
prefetches, and that flow belongs to agent 2.

### 2. `/discord` is a routing-layer redirect

`next.config.ts`. The route handler was `force-dynamic`: one proxy invocation plus one function
invocation to return a constant redirect. `DISCORD_GUILD_ID` is now read at build time and
emitted as a `redirects()` entry, which Vercel answers without invoking anything. The route
handler stays as the fallback when the variable is absent at build.

### 3. Shared profiles are static (ISR)

`app/p/[username]/page.tsx`. The page was `force-dynamic` even though nothing on it depends on
the visitor, and its data was already cached for ten minutes with `unstable_cache`. It is now
`revalidate = 600` with an empty `generateStaticParams()`: each profile renders once on first
visit, then is a static file. Freshness is the same as before, because the page inherits the
`public-profile` tag that every profile-affecting write already invalidates. Verified locally:
`HIT`, `HIT`, a write route firing `revalidatePublicProfiles()`, then `STALE`, then `HIT`.

### 4. Hackathon cards no longer prefetch their detail page

`components/hackathon-card.tsx`, `components/past-hackathon-card.tsx`,
`lib/hackathons/detail-link.ts`. `/hackathons/[slug]` is rendered per request, so `<Link>`
cannot prefetch the page, only its route tree, but it still sent one request per card that
scrolled into view. Each one went through the proxy and a function. Measured in headless
Chromium on the baseline: 6 on the first screen, **190** after scrolling the list. With
`prefetch={false}` it is 0, and the click makes the same single request it always did:
click → panel visible was 107 ms median before and 108 ms after (n = 12 each).

### 5. Sentry and PostHog are off the hydration path

- `instrumentation-client.ts`, `lib/monitoring/sentry-browser.ts`, `app/global-error.tsx`.
  Sentry's browser SDK was statically imported by `instrumentation-client.ts`, which put it in
  the root chunks of every page: 51 KB gzip that had to download and execute before hydration.
  It now loads in its own chunk when the browser goes idle (3 s ceiling), and is never requested
  when `NEXT_PUBLIC_SENTRY_DSN` is unset. Errors thrown before it arrives are buffered (up to
  20) and reported once it loads. Verified in a browser against a build with a dummy local DSN:
  no Sentry client at `DOMContentLoaded`, client present after idle, and an error thrown in the
  gap was delivered.
  The wrapper module exists because a bare `import("@sentry/nextjs")` requests the whole
  namespace and defeats tree-shaking: that version produced a 155 KB chunk. Through the wrapper
  it is 49 KB.
- `instrumentation.ts`. The server SDK is not initialized when there is no DSN. No change when
  there is one.
- `lib/analytics/client.ts`, `lib/analytics/events.ts`. `trackEvent` imported `posthog-js`
  statically, which put the 73 KB SDK in the first-load bundle of the organizer console and
  `/admin/organizer-preview`. Events now go through a dependency-free handle that the lazy
  provider registers itself with; events tracked before then are queued (up to 50) and flushed.
- `components/providers/app-providers.tsx`. The PostHog chunk mounts on idle (2 s ceiling)
  instead of during hydration, and is not requested at all without `NEXT_PUBLIC_POSTHOG_KEY`.

### 6. Identity comes from the session token, not the database

`lib/auth.ts` adds `getCurrentIdentity()`: app user id, Clerk id and role, read from the
verified session claims. The role has always come from claims; what changes is that gates and
mutations no longer fetch the `users` row just to take its id.

- `requireAdminUser()` uses it, so every admin page and admin API call drops one query. Its
  return shape (`gate.user.id`, `gate.role`) is unchanged, so no admin route needed editing.
- Switched to it: track, user-hackathons, check-in, the three Devpost routes, profile, all six
  organizer routes, the organizer layout and pages, `/account/settings`, and the `GET` of
  `/api/hackathon-submissions`.
- Left on the full record: the submission `POST` (it stores the submitter's email and name) and
  the vote route, which is agent 4's file. See [follow-ups](#follow-ups).

### 7. Fewer, flatter database round trips

- **`lib/db/index.ts`: a dedicated HTTP agent for Neon.** Every query is an HTTPS request, and
  Node's built-in `fetch` closes idle sockets after 4 seconds. On a site where requests to a
  warm instance are usually further apart than that, each request repeats the TCP + TLS
  handshake before its first query. Neon keeps an idle connection usable for at least 55 s
  (measured), so the agent holds sockets for 50 s. Query time after N seconds idle, Node 24:

  | Idle before the query | 3 s | 6 s | 15 s | 30 s | 55 s |
  | --- | --- | --- | --- | --- | --- |
  | Built-in fetch | 25 ms | 166 ms | 79 ms | 411 ms | 104 ms |
  | Dedicated agent | 24 ms | 23 ms | 23 ms | 24 ms | 23 ms |

  The agent also pins HTTP/1.1, which matters on Node 26. See
  [the Node 26 finding](#node-26-serializes-parallel-queries).
- **`lib/hackathons/detail-data.ts`, `lib/hackathons/row-extras.ts`: the detail view is one
  round trip.** It was three in sequence on a cache miss (row, then tags and Discord link, then
  the viewer's tracked stage and votes), because each step needed the id from the one before.
  The public half is now one statement with subqueries, and the viewer half is one statement
  keyed by slug so it starts alongside the cached lookup instead of after it.
- **`app/(app)/my/page.tsx`: `/my` is one statement.** Source badge, Discord link and votes were
  three more queries in a second round trip.
- **`app/(app)/account/page.tsx`, `lib/auth.ts`: `/account`.** The Clerk profile fetch (a
  network call to Clerk's API, the slowest thing on the page) ran first, followed by a select,
  an unconditional update, another select, and only then the profile queries. Now the Clerk
  fetch, the users row and the profile queries all start together, and the update is skipped
  when nothing changed (`lib/profile/clerk-sync.ts`, unit-tested).
- **`lib/hackathons/admin-service.ts`: `/admin/hackathons`** loads its rows and the guild's
  channel mapping together rather than one after the other.

The new subqueries were checked against the helpers they replace across all 174 hackathons in
the database (Discord link, vote totals, viewer vote signed in and out, tags, tracked stage):
0 mismatches. That check found one real difference first: five series have a channel in each
of two Discord servers, and the old helper's pick between them was arbitrary. The new query
takes the oldest, which matched the old result in every case and is stable.

### 8. Smaller items

- `next.config.ts`: `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` for
  `/logo-beaver.svg` and `/photos/*`. Vercel's default for `public/` is `max-age=0`, so every
  page view re-requested the logo.
- `app/api/geo/route.ts`: `private, max-age=3600` on a successful lookup, so a returning
  visitor's browser answers it.

### Looked at and left alone

- **Images.** Only one image goes through the optimizer (the About photo); catalog logos are
  remote and `unoptimized` on purpose. Nothing to save.
- **Cron.** Two runs a day, already batched with bounded concurrency. The only change is that
  they no longer pass through the proxy.
- **Region.** Functions are in `iad1`, the database in `us-east-1`. Correct.
- **Fonts.** Self-hosted through `next/font`, two families, already minimal.
- **Driver.** Stayed on Neon HTTP. With the idle-socket problem fixed, a warm query costs one
  round trip plus about 1 ms, which leaves little for a pooled TCP driver to win.
- **Indexes.** None to propose. City search already uses trigram indexes (0.6 ms); the new
  subqueries use `hackathon_votes_hackathon_value_idx` and the existing channel indexes.

## Measurements

### How to read the timings

- Production builds (`pnpm build`), served with `next start -p 3103`, measured with `curl` from
  the same machine. 2 warm-up requests, then 20 sequential runs per endpoint.
- The server ran under **Node 24.22.3**, the version the Vercel project is set to. This
  machine's default is Node 26, which behaves differently enough to distort the comparison
  (see below), so the baseline was re-measured under Node 24 before anything was changed.
- **Local latency overstates the absolute savings.** This machine is about 24 ms from Neon;
  a function in `iad1` is about 1–2 ms away. A removed round trip saves roughly 25 ms here and
  a few milliseconds in production. The round-trip *counts* carry over exactly; the idle-socket
  saving (a TLS handshake) and the invocation counts carry over too.
- Three other agents were building and benchmarking on this machine and database at the same
  time (load average about 6). p95 and max are noisy. The "after" benchmark was run twice; the
  table uses the second run and notes where the first disagreed.
- Signed-in requests used a session token minted for a test session on the Clerk **dev**
  instance (the script refuses a live key). Both sessions were revoked afterwards.

### Response times, milliseconds (median / p95)

`total` is time to last byte. TTFB is listed separately only where the page streams.

| Request | Before | After |
| --- | --- | --- |
| `GET /about` | 2.0 / 2.5 | 0.9 / 1.5 |
| `GET /corporate` | 2.1 / 2.5 | 0.7 / 0.8 |
| `GET /discord` | 2.2 / 2.9 | 0.4 / 0.4 |
| `GET /p/[username]` | 7.1 / 11.7 | 0.8 / 0.9 |
| `GET /api/geo` | 2.0 / 2.6 | 0.8 / 1.0 |
| `GET /api/cities/search?q=tor` | 27.7 / 31.4 | 27.6 / 29.6 |
| `GET /hackathons/[slug]`, signed out, cached | 29.7 / 31.3 | 27.7 / 34.0 |
| `GET /hackathons/[slug]`, signed in, cached | 31.5 / 78.7 | 28.1 / 30.0 |
| `GET /hackathons/[slug]`, signed out, first view (n = 20 slugs) | 83.1 / 152.8 | 31.4 / 37.0 |
| `GET /hackathons/[slug]`, signed in, first view (n = 20 slugs) | 84.3 / 96.3 | 30.3 / 33.1 |
| `GET /my` | 61.7 / 108.3 | 30.2 / 31.9 |
| `GET /account` (TTFB) | 5.2 / 7.1 | 6.5 / 8.7 |
| `GET /account` (total) | 215.6 / 370.9 | 94.3 / 170.4 |
| `GET /account/settings` (total) | 29.6 / 32.4 | 3.5 / 4.5 |
| `GET /admin/hackathons/new` | 38.6 / 82.0 | 3.1 / 4.1 |
| `GET /admin/hackathons` | 197.1 / 300.9 | 125.0 / 426.7 |
| `GET /admin/submissions` | 260.4 / 500.5 | 248.6 / 540.5 |
| `GET /organizer` | 175.8 / 306.6 | 136.8 / 343.4 |
| `PATCH /api/hackathons/[id]/track` (rejected with 400 after auth; writes nothing) | 27.5 / 35.0 | 2.0 / 2.5 |

Notes:

- `/api/cities/search` and the cached detail view did not get faster and were not expected to.
  The search route's saving is the proxy invocation, which a local server cannot show.
- `/my` on the first "after" run was 54.5 / 140.4 while another agent's benchmark was running;
  the second run and a separate 16-request check (29–52 ms) agree with 30 ms. Its query runs in
  0.28 ms in the database.
- `/admin/submissions` is unchanged within noise: it saved one round trip out of a response
  dominated by fetching and rendering 200 submissions with their JSON payloads.
- The three list pages (`/admin/hackathons`, `/admin/submissions`, `/organizer`) have wide
  spreads in both runs. Their medians moved in the right direction; do not read much into the
  exact figures.

### Requests arriving after the server was idle (6 s gaps, n = 10)

This is the common case for a low-traffic site and the one the Neon agent targets.

| Request | Before | After |
| --- | --- | --- |
| `GET /hackathons/[slug]`, signed out | 86.7 / 132.7 | 31.3 / 102.4 |
| `GET /my` | 173.9 / 317.0 | 32.3 / 45.3 |

### JavaScript

Next 16 with Turbopack does not print first-load JS or a proxy bundle size in its build output,
so these were measured two ways that agree: (a) every non-`nomodule` script tag in the served
HTML, fetched with `Accept-Encoding: gzip`; (b) the root chunks plus each route's
`entryJSFiles` from its client-reference manifest, gzip level 9.

Hydration-blocking JS from the served HTML, gzip KB:

| Page | Before | After |
| --- | --- | --- |
| `/` | 273.3 | 221.7 |
| `/about`, `/corporate` | 272.9 | 221.2 |
| `/hackathons` | 338.6 | 287.0 |
| `/hackathons/[slug]` | 320.4 | 268.7 |
| `/p/[username]` | 273.8 | 222.2 |
| `/sign-in` | 265.7 | 214.1 |

From the manifests: root chunks shared by every page 182.7 → 131.1 KB; `/organizer`
399.0 → 276.3 KB; `/admin/organizer-preview` 399.8 → 277.1 KB; every other route −51.4 KB.

What this is and is not: with Sentry and PostHog enabled, the same bytes are still downloaded,
later and off the critical path (Sentry 49 KB, PostHog 73 KB). The total client JS in the build
is unchanged (603 → 600 KB). Bytes are only *removed* in environments without a DSN or key.

### Build output

| | Before | After |
| --- | --- | --- |
| Routes | 62 | 62 |
| Static (`○`) | 7 | 7 |
| ISR (`●`) | 0 | 1 (`/p/[username]`) |
| Dynamic (`ƒ`) | 55 | 54 |
| Proxy matchers | everything except `/api/health`, `/_next`, static files | also excludes the seven route groups in item 1 |
| Server chunks on disk | 118,452 KB | 118,580 KB |

The proxy's own code is unchanged apart from the matcher (its entry chunks total 387 KB raw),
so there is no bundle-size change to report for it.

### Estimated effect on Vercel usage

Counts are measured or follow directly from the routing change. I have not turned them into
dollars: that depends on the plan and on traffic I cannot see.

| Situation | Billed invocations before | After |
| --- | --- | --- |
| Visitor scrolls the whole catalog | up to 190 prefetches × (proxy + function) = 380 | 0 |
| Catalog, first screen only | 6 × 2 = 12 | 0 |
| View of a shared profile already rendered in the last 10 min | 2 (proxy + function) | 0 |
| Click on a `/discord` link | 2 | 0 |
| Visit to `/about` or `/corporate` | proxy on the document and on each of the page's own RSC/prefetch requests | 0 for those |
| City autocomplete keystroke, CDN hit | 1 (proxy) | 0 |
| City autocomplete keystroke, CDN miss | 2 | 1 |
| `/api/geo`, repeat within an hour | 2 | 0 (browser cache) |
| Cron runs per day | 4 (2 × proxy + function) | 2 |

Function duration falls with the round trips removed above. On Fluid compute, time spent
waiting on the database is billed as provisioned memory rather than CPU, so the saving there is
modest; the user-facing latency is the larger benefit.

## Node 26 serializes parallel queries

Found while investigating why parallel queries looked slow locally. On Node 26 (bundled undici
8), built-in `fetch` talks HTTP/2 to Neon and sends concurrent requests to the same host one at
a time. Four `select pg_sleep(0.1)` in a `Promise.all`:

| Client | Node 24.22.3 | Node 26.4.0 |
| --- | --- | --- |
| Built-in `fetch` | 129 ms | 519 ms |
| `undici@6` agent, HTTP/1.1 (what `lib/db` now uses) | 131 ms | 128 ms |

Production is on Node 24, so this is not costing anything today. It would have made every
`Promise.all` of queries sequential the day the project moved to Node 26. The agent in
`lib/db/index.ts` removes that hazard. It is also why local development on Node 26 has been
slower than production for any page with parallel queries.

## Risks

- **Claims are trusted for writes.** `getCurrentIdentity()` returns the `appUserId` stored in
  Clerk's public metadata without checking the `users` table. That was already true for
  `/my`, the catalog and the detail view; it now extends to mutations. If one Clerk instance is
  ever pointed at two different databases, the id will not exist in the second one and writes
  will fail on the foreign key instead of succeeding. A deleted `users` row behaves the same
  until the session ends.
- **Shared profiles are cached as pages.** After an edit, the first visitor still gets the old
  page while it regenerates. The data behaved this way before; now the HTML does too.
- **Sentry starts late.** Errors in the first moments of a page are buffered, not lost, unless
  the tab closes before the SDK loads (at most about 3 s). Router transitions that happen before
  it loads are not traced.
- **PostHog starts late.** The first pageview is sent up to 2 s after hydration, so a visit
  shorter than that may not be counted.
- **`/discord` is fixed at build time.** Changing `DISCORD_GUILD_ID` needs a redeploy to take
  effect, which is how Vercel env changes work anyway.
- **Idle sockets and frozen instances.** If Neon closed an idle socket before 50 s, a query
  could land on a dead connection. Measured headroom is at least 55 s, and the same exposure
  already existed inside the built-in client's 4-second window.

## Follow-ups

For the merge:

- **Vote route (agent 4's file).** `app/api/hackathons/[id]/vote/route.ts` still calls
  `getCurrentUserContext()` and only uses `userContext.user.id`. Changing it to
  `getCurrentIdentity()` / `.userId` removes one query from every vote.
- **Files outside my listed scope that I edited**, each as small as I could make it:
  `components/hackathon-card.tsx` (three `prefetch` props and one import),
  `components/past-hackathon-card.tsx` (one prop, one import), and
  `lib/hackathons/admin-service.ts` (list loader only). `lib/hackathons/catalog.ts`,
  `votes.ts` and `discord-cards.ts` are untouched.
- **Discord links with two servers in one database.** This database holds channels for two
  guilds. `getDiscordLinksByHackathon()` (catalog cards) does not filter by the configured
  guild, so a card can link to the other server's channel. The new subquery has the same
  behavior, made deterministic. Filtering by `DISCORD_GUILD_ID` would fix both.

For production / the Vercel dashboard:

- Confirm the project is still on Node 24.x, and that Fluid compute is on.
- Set `CLERK_JWT_KEY` (the instance's PEM public key, from the Clerk dashboard). Without it
  the proxy fetches Clerk's JWKS over the network on each cold start.
- `/account` still spends about 80–100 ms on Clerk's API. Either add name and email to the
  session token claims, or handle Clerk's `user.updated` webhook, and the page can drop the
  call entirely.
- Nothing to migrate and no new env vars. `DISCORD_GUILD_ID` must be available to the build,
  which it is for any Vercel project variable.

Not done, for agent 2 or a later pass:

- `app/(app)/layout.tsx` calls `auth()`, which makes every page under it dynamic. Moving the
  signed-in state to the client would let the detail page be cached like the shared profile.
- `/my` has no `loading.tsx`, so its first byte waits for the query. `/account` has one and
  sends its shell in 6 ms.
- `experimental.staleTimes.dynamic` would stop back-and-forth navigation from refetching, at
  the cost of showing a stale board for a few seconds after tracking a hackathon.

## Side effects of testing

- The headless-browser runs (about 40 page loads) loaded PostHog normally, so the project's
  PostHog has that many pageviews from `localhost:3103` around midnight on Nov 24. Only the
  final Sentry check intercepted analytics traffic.
- Two Clerk dev-instance test sessions were created for the admin account and revoked.
- `/account` was requested about 90 times as that account. The baseline runs updated
  `users.updated_at` each time, as the page always did; the new code skips that write.
- One `DELETE /api/hackathons/00000000-…/track` on a hackathon id that does not exist, to fire
  cache invalidation. It deleted no rows.
- No schema changes, no Discord channel changes, nothing pushed.
