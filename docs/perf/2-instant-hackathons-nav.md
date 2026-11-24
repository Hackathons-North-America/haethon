# Perf 2: instant homepage → Hackathons navigation

Branch `t3/instant-hackathons-navigation`. Scope: the landing page, the app shell, `/hackathons`, and how that page gets its data.

## Result

Clicking "Go to app" on the homepage used to show hackathon cards about 0.76 s later. It now takes about 0.08 s, and the click no longer talks to the server at all.

| Homepage → Hackathons, click to cards visible (median) | Before | After |
| --- | --- | --- |
| Warm server, visitor has been on the page a moment | 763 ms | 78 ms |
| Same, with 100 ms of network latency added | 1012 ms | 70 ms |
| Cold server (restarted, data cache empty) | 930 ms | 74 ms |
| Warm server, clicked the instant the link works | 758 ms | 70 ms |
| Same, with 100 ms of network latency added | 1155 ms | 430 ms |

| Other | Before | After |
| --- | --- | --- |
| `/hackathons` in the build output | `ƒ` dynamic | `○` static, revalidate 10m |
| `/hackathons` TTFB, warm (median / p95) | 34.6 / 37.6 ms | 3.2 / 6.4 ms |
| `/hackathons` TTFB, cold (median / p95) | 375.6 / 575.9 ms | 12.5 / 17 ms |
| First-load JS, `/hackathons` (gzip) | 459.8 KB, 21 scripts | 417.9 KB, 19 scripts |
| First-load JS, `/` (gzip) | 395.0 KB, 17 scripts | 395.3 KB, 17 scripts |
| Same-origin requests fired by the click | 13 | 2 (neither blocks the page) |
| Server requests per catalog view for card-link prefetches | 6 | 0 |

Full tables with p95, min and max are under [Measurements](#measurements).

## What was slow

Two things, in this order of size.

1. **A 0.7 s curtain.** The app shell plays an entrance when it mounts: an ink panel wipes off the screen while the header and content fade in. It played on every mount, including a click from the landing page, so the cards were hidden for about 670 ms after they had already rendered. In the baseline the cards were in the DOM at 96 ms and visible at 763 ms.
2. **A server round trip on every click.** `/hackathons` was rendered per request, for two reasons: `app/(app)/layout.tsx` called `auth()` to tell the nav who was signed in, and the page read `searchParams`. A dynamic route with no `loading.tsx` cannot be prefetched, so the click waited for the server to render (including one live vote-totals query), then downloaded five script chunks, and only then started the curtain. Locally that was about 90 ms warm and 250 ms cold; with 100 ms of latency added it was 330 ms.

The catalog query itself was already cached (`unstable_cache`, 10 minutes, tag `hackathon-catalog`). I did not touch its SQL.

## What changed

### 1. `/hackathons` is a static page

`app/(app)/hackathons/page.tsx` is now prerendered and revalidated (ISR): `dynamic = "force-static"`, `revalidate = 600`. It renders one snapshot, the unfiltered first page of the catalog with vote totals as of that render, shared by every visitor.

- A static route is prefetched in full by `<Link>`. The landing page's two links to `/hackathons` now download the whole page while the visitor reads the hero, so the click renders from memory.
- A direct visit is served as a file, and from the CDN on Vercel. A cold server no longer costs anything: the page exists from the build.
- The page calls the existing `getPublicHackathonCatalog()` with the same arguments the API uses for its first page, so they share one cache entry. I checked in the Next 16.4.6 source that `unstable_cache` passes its tags and revalidate time to the page that reads it, and that it waits for fresh data when the reader is itself being cached. `.next/server/app/hackathons.meta` confirms the page carries the `hackathon-catalog` tag.
- `force-static` is a guard. If someone later adds a request-time read to this page, it gets an empty value instead of quietly turning every visit back into a server render.
- If the database cannot be reached during `next build`, the build still succeeds: the page ships with a loading placeholder and the browser loads the first page from the API until the next regeneration. I tested this with an unreachable `DATABASE_URL` and an empty data cache (build passed, 0 cards and 1 placeholder in the HTML). At runtime a failed regeneration throws instead, so Next keeps the last good snapshot.

To make this possible, everything that depended on the request moved into the browser:

**The query string** (`components/hackathon-catalog.tsx`, `lib/hackathons/catalog-url.ts`). A plain `/hackathons` shows the static cards. A filtered URL (a reload, a shared link) mounts the search already set to those filters and loads results from `/api/hackathons`, with placeholder cards while it loads. The static HTML of a filtered URL still contains the unfiltered cards, so a small inline script marks `<html>` and a CSS rule keeps them hidden until the filtered view has replaced them. Visitors never see the wrong cards.

**The viewer** (`components/use-viewer-card-hydration.ts`, `app/api/hackathons/card-state/route.ts`). A signed-in browser makes one request after the page renders and gets its pipeline stages, its own votes, and live vote totals for the cards on screen. Signed-out visitors make no request.

**The nav** (`components/viewer-auth.tsx`, `lib/auth-hint.ts`, `lib/auth-role.ts`). `app/(app)/layout.tsx` no longer calls `auth()`. `AppTopNav` reads the sign-in state and role from Clerk in the browser. Because Clerk takes a few hundred milliseconds to load on a direct visit, the last known state is kept in `localStorage` (`hna:auth-hint`, values like `in:admin` or `out`) so a returning member's nav starts out right. It holds no credential and only decides which links are shown.

### 2. The shell entrance no longer plays on client-side navigation

`components/app-shell-transition.tsx`, `components/app-top-nav.tsx`, `app/globals.css`.

The entrance still plays on a direct visit or reload, with the same timings and easing. It is skipped when the shell mounts during a client-side navigation, which is the homepage click. The two cases are told apart by how the component first renders (server and hydration versus a client mount).

The entrance is now CSS keyframes instead of `motion` components. That has two effects: it starts with the first paint instead of waiting for JavaScript to hydrate, and `prefers-reduced-motion` is honoured without a hydration mismatch.

**This is a visible design change, and it is the largest part of the speed-up.** If the wipe is wanted on the landing-page click as well, change `useShellIntro()` to return `true`; the click then costs about 0.75 s again.

### 3. Less work around the click

- **Cover images.** The page emits preload hints for the first three covers. They travel with the prefetched page, so those covers are already downloaded when the cards appear (first cover loaded: 413 ms → 78 ms after the click).
- **Card detail links** (`components/intent-prefetch-link.tsx`). Each card's link to `/hackathons/[slug]` was prefetched when it scrolled into view. That destination is dynamic, so the prefetch could not fetch the page; it only cost two server requests per card. They now prefetch on hover, focus or touch.
- **Gated links** (`components/login-required-dialog.tsx`). Links to protected pages no longer prefetch unless the visitor is known to be signed in. Before, each such prefetch was redirected to the sign-in page and failed with a CORS error in the console.
- **The animation library is off the critical path.** `motion` is no longer in the JavaScript `/hackathons` needs to show cards (−42 KB gzip). The search bar's dropdowns still use it, loaded right after the page is interactive (`components/hackathon-search-popover.tsx`). The card was also pulling it in through the side panel's module, so that one hook moved to `components/hackathon-panel-open.ts`.
- **The proxy skips `/hackathons`** (`proxy.ts`). The exact path, not the pages under it, is left out of the Clerk matcher, like `/api/health` already was. The page reads nothing from the session on the server, so Clerk in front of it only added a proxy invocation per visit and prefetch and, for a returning member with an expired session token, a redirect through Clerk before any HTML was sent. I checked the compiled matcher: `/hackathons` and `/hackathons/` are excluded; `/hackathons/foo`, `/api/hackathons`, `/my` and the rest still match.

## Cache invalidation

The static page is tagged `hackathon-catalog`, so every existing call to `revalidateHackathonCaches()` now also regenerates it. I traced every write to `hackathons`, `hackathon_dates`, `hackathon_locations`, `hackathon_series` and `discord_channels`:

| Write path | Invalidates |
| --- | --- |
| `updatePublishedHackathon`, `setHackathonSeriesRecurring`, `deleteHackathon` (`admin-service.ts`) | Already did |
| `setHackathonSource` | Yes, through `updatePublishedHackathon`, which the route calls right after |
| `createPublishedHackathon`, `mergeIntoHackathon`, `importAdminHackathons` incl. feed updates (`review-service.ts`) | Already did |
| `importDevpostItems` (`devpost/import-service.ts`) | Already did |
| Admin import: Discord channels created for auto-approved rows | **Added**, in `app/api/admin/hackathon-imports/route.ts` (the service invalidates before it creates those channels) |
| Admin create with an existing Discord channel | **Added**, in `app/api/admin/hackathons/route.ts` |
| Admin "create Discord channel" decision | **Added**, in `app/api/admin/hackathons/[id]/discord-channel/route.ts` |
| Admin delete Discord channel | **Added**, in `app/api/admin/discord/channels/[id]/route.ts` |
| Daily Discord sync and cleanup crons | **Added**, in both cron routes |

The added ones matter because cards carry the hackathon's Discord link. Before this change those writes also went unnoticed for up to 10 minutes; they were simply stale in the data cache instead of in a page.

Not invalidated, on purpose: votes. Totals in the static page can be up to 10 minutes old for signed-out visitors. Signed-in visitors get live totals from the overlay request. `scripts/*` run outside Next and cannot invalidate anything; the 10-minute window covers them.

`revalidateTag(tag, "max")` is stale-while-revalidate, as before: the first visitor after an edit gets the old page and triggers the rebuild.

## Per-user data

Nothing per-user is cached across users.

- The static page is rendered with `applyUserCardState(cards, null)`: public data only.
- `/api/hackathons/card-state` is `force-dynamic` and answers `Cache-Control: private, no-store`. It validates its input (1–60 UUIDs) and returns only the caller's own stage and vote.
- `/api/hackathons` is unchanged apart from one added field, `signedIn`.

## Behaviour changes to know about

1. No wipe on the landing-page click (section 2).
2. Signed-out visitors see vote totals up to 10 minutes old on `/hackathons`. They were live before.
3. On a direct visit, a signed-in member's stages and own votes appear a moment after the cards rather than with them.
4. On a direct visit to a filtered URL, results appear after a short placeholder instead of arriving in the HTML. Crawlers and no-JS visitors get the unfiltered catalog on every `/hackathons` URL.
5. The nav's signed-in links (Admin, Organizer, no Login) settle in the browser. With no remembered state the static nav shows the signed-out version.
6. Opening a hackathon's side panel is about 16 ms slower at the median (95 → 111 ms, n=10 each), the price of not prefetching every visible card.

## Measurements

Same machine for both (Apple M5 Pro, macOS 27.0.1, Node 26.4.0), production builds served by `next start -p 3102`, Chromium via Playwright, a fresh browser context per run, viewport 1440×900. Values are milliseconds as `median (p95; min–max)`.

The baseline was measured twice, once before any change and once more at the end from a clean export of the base commit (`0c106bc`) with the final harness. The two agreed (click to cards visible, warm: 758 and 763 ms). The numbers below are from the second run, so before and after used the identical script.

### Homepage → Hackathons click

| Scenario | Metric | Before | After |
| --- | --- | --- | --- |
| Warm, settled (n=15) | Cards in DOM | 96.4 (161.4; 85.7–161.4) | 77.8 (82.3; 63.2–82.3) |
| | Cards visible | 762.9 (822.8; 754.9–822.8) | 77.8 (82.3; 63.2–82.3) |
| | First cover loaded | 413.2 (813.4; 155.4–813.4) | 77.8 (82.3; 63.2–82.3) |
| | Same-origin requests after click | 13 | 2 |
| Warm, immediate click (n=15) | Cards in DOM | 94.9 (216.5; 87.7–216.5) | 69.6 (84.9; 66.5–84.9) |
| | Cards visible | 757.7 (910.8; 747.4–910.8) | 69.6 (84.9; 66.5–84.9) |
| | First cover loaded | 482.4 (747.9; 148.3–747.9) | 81.3 (298.3; 67.2–298.3) |
| Warm, settled, +100 ms latency (n=15) | Cards in DOM | 327.2 (356.8; 320.1–356.8) | 70.2 (79.9; 61.4–79.9) |
| | Cards visible | 1012.4 (1030.8; 995.5–1030.8) | 70.2 (79.9; 61.4–79.9) |
| | First cover loaded | 979.9 (1381.5; 754.3–1381.5) | 70.2 (79.9; 61.4–79.9) |
| Warm, immediate, +100 ms latency (n=15) | Cards in DOM | 475.4 (485.3; 360.5–485.3) | 429.7 (445.6; 225.6–445.6) |
| | Cards visible | 1155.4 (1172.4; 1048–1172.4) | 429.7 (445.6; 225.6–445.6) |
| | First cover loaded | 1266.7 (1731.2; 955.8–1731.2) | 898 (1220; 764.1–1220) |
| Cold, settled (n=10) | Cards in DOM | 257.2 (410.2; 239.2–410.2) | 73.6 (79.3; 62.9–79.3) |
| | Cards visible | 930.4 (1112.7; 914.8–1112.7) | 73.6 (79.3; 62.9–79.3) |
| | First cover loaded | 470.5 (832.4; 298.2–832.4) | 73.6 (79.3; 62.9–79.3) |

The shell wipe covered the cards in every baseline run and in none of the after runs. No run fell back to a full document navigation.

### `/hackathons` TTFB and direct visit

| Metric | Before | After |
| --- | --- | --- |
| Document TTFB, warm (n=30) | 34.6 (37.6; 32.9–41.4) | 3.2 (6.4; 2.8–6.5) |
| Document TTFB, cold (n=10) | 375.6 (575.9; 362.8–575.9) | 12.5 (17; 11.5–17) |
| Direct visit: response start (n=15) | 39.7 (93.6; 32.1–93.6) | 6.8 (10.2; 3.5–10.2) |
| Direct visit: cards in DOM | 48.8 (113.4; 39.4–113.4) | 18.7 (26.2; 12.7–26.2) |
| Direct visit: cards visible | 797.7 (844.8; 779.7–844.8) | 755.6 (768.1; 742.5–768.1) |
| Direct visit: first cover loaded | 422.9 (715.3; 144.8–715.3) | 57.3 (66.6; 49.4–66.6) |

### Build output

| | Before | After |
| --- | --- | --- |
| `/` | `○` static | `○` static |
| `/hackathons` | `ƒ` dynamic | `○` static, Revalidate 10m, Expire 1y |
| First-load JS `/`: scripts / raw / gzip | 17 / 1320.7 KB / 395.0 KB | 17 / 1321.8 KB / 395.3 KB |
| First-load JS `/hackathons`: scripts / raw / gzip | 21 / 1519.0 KB / 459.8 KB | 19 / 1394.1 KB / 417.9 KB |

Next 16 with Turbopack no longer prints first-load sizes, so these are every `<script src>` in the served document, fetched and gzipped.

### Method

The harness is `scripts/perf/hackathons-nav-bench.mjs`:

```
pnpm build && pnpm start -p 3102 &
node scripts/perf/hackathons-nav-bench.mjs js
node scripts/perf/hackathons-nav-bench.mjs ttfb --runs 30
node scripts/perf/hackathons-nav-bench.mjs nav --runs 15
node scripts/perf/hackathons-nav-bench.mjs nav --runs 15 --click immediate
node scripts/perf/hackathons-nav-bench.mjs nav --runs 15 --latency 100
node scripts/perf/hackathons-nav-bench.mjs nav --runs 15 --click immediate --latency 100
node scripts/perf/hackathons-nav-bench.mjs direct --runs 15
# stop the server; these two start and stop it themselves
node scripts/perf/hackathons-nav-bench.mjs nav --runs 10 --cold
node scripts/perf/hackathons-nav-bench.mjs ttfb --runs 10 --cold
```

- **Click timing** is taken inside the page with `performance.now()`, from the click event on the nav's "Go to app" link to the animation frame where the condition first holds.
  - *Cards in DOM*: the first card element exists.
  - *Cards visible*: it is on screen, its cumulative opacity is at least 0.95, and the shell's wipe no longer overlaps it.
  - *First cover loaded*: the first card's cover image has finished loading.
- **Settled** waits for network idle plus 1.5 s before clicking. **Immediate** clicks as soon as React has hydrated the link.
- **+100 ms latency** is Chrome's network emulation: 100 ms added per request, 10 Mbit/s down, 5 Mbit/s up.
- **Cold** restarts `next start` and deletes `.next/cache/fetch-cache` before every run. Prerendered output from the build is left alone, since that is the deployed state too.
- **Direct visit** first opens `/about` in the same context, so shared scripts are in the HTTP cache and Clerk's development-instance handshake redirect has already happened, then times `/hackathons` from navigation start.
- `NEXT_PUBLIC_POSTHOG_KEY` was commented out in my local `.env.local` for both builds so benchmark traffic did not reach analytics. That file is gitignored.

## What did not improve, or could not be measured

- **The homepage's own JavaScript is unchanged** (395 KB gzip). Most of it is Clerk, Sentry and React. I replaced the one `motion` import on the landing page with a matchMedia hook, but it made no measurable difference.
- **About 70 ms of client rendering remains** between the click and the cards, the time React takes to mount the search bar and 30 cards. It was 96 ms before. It will be several times larger on a slow phone; I did not measure with CPU throttling.
- **A click before the prefetch has finished on a slow network** improved less (1155 → 430 ms): the page and its scripts still have to be downloaded then.
- **Direct visits are barely faster to "cards visible"** (798 → 756 ms). The page arrives much sooner, but I kept the 0.75 s entrance on direct visits. Dropping it there too would put cards on screen within about 20–60 ms locally. That is a design decision I left alone.
- **Signed-in behaviour was not exercised with a real session.** I had no test account for the Clerk development instance. The overlay and the nav were tested in the browser with a remembered sign-in and a mocked `card-state` response, and by unit tests. Worth one manual pass as a member and as an admin before merging: stage chips and your own vote appear on `/hackathons`, and the Admin link shows.
- **Local numbers are not production numbers.** The server and browser share a machine and the database is remote. On Vercel the dynamic render sat next to the database, but also paid for a function invocation and, sometimes, a cold start; the static page is served from the CDN. Expect the same direction, different magnitudes.
- **Cover images are the organizers' originals**, 130 KB to 2 MB each. Preloading three of them from the landing page costs visitors who never click through up to a few MB. Serving resized covers would fix both that and the image pop-in further down the page. That belongs with the import pipeline.

## Tests

Added, all in `tests/unit/`:

- `app-shell-intro.test.ts`: the entrance is in the server HTML, survives hydration, and is absent on a client-side mount.
- `catalog-url.test.ts`: URL parsing matches the old server behaviour, and the inline boot script agrees with it on every URL the page writes.
- `viewer-card-state.test.ts`: id validation, the merge, and when queued requests are sent, held, or dropped.
- `hackathon-search-viewer-state.test.ts`: viewer state lands on static cards; a late answer does not undo a stage the viewer just changed; a filtered URL loads on mount; placeholders and retry.
- `auth-hint.test.ts`: the remembered sign-in state and role helpers, including blocked storage.

`pnpm typecheck`, `pnpm lint` (0 errors; the 1 warning is pre-existing) and `pnpm test` (35 files, 298 tests) pass. `tests/e2e/hackathons.spec.ts` was not run or updated; it already refers to labels the search bar no longer has.

## Edits outside my area

Kept small; listed so they are easy to spot in the merge.

| File | Edit |
| --- | --- |
| `lib/auth.ts` | The three pure role helpers moved to `lib/auth-role.ts` so the browser can use them. `lib/auth.ts` re-exports them; no caller changed. |
| `app/api/hackathons/route.ts` | Response gains `signedIn`. Query and caching untouched. |
| Six API routes under `app/api/admin` and `app/api/cron` | One `revalidateHackathonCaches()` call each (table above). |
| `components/hackathon-card.tsx` | Detail links use `IntentPrefetchLink`; the stage buttons follow a changed prop; the vote control is re-keyed when its totals change. |
| `components/hackathon-side-panel.tsx`, `components/past-hackathon-card.tsx` | `useHackathonPanelOpen` moved to its own module; import path updated. |
| `components/login-required-dialog.tsx` | No prefetch unless signed in. |
| `lib/hackathons/status-events.ts` | One added export. |
| `proxy.ts` | `/hackathons` left out of the matcher. |

## DDL applied to DB

None. No schema change and no writes; the database was only read (catalog and vote-total queries during builds and benchmark runs).

## Risks

- **`auth()` on `/hackathons`.** If the page or `app/(app)/layout.tsx` ever calls `auth()` on the server again, it will throw, because the proxy no longer runs for that path, and with `force-static` it could not see a session anyway. Both files and `proxy.ts` carry comments saying so.
- **Client-side role.** The nav reads the role from the browser's copy of the session claims (`sessionClaims.metadata.role`), the same claim the server read. It only controls which links are shown; `/admin` and `/organizer` still check on the server. If the claim is missing in the browser, the Admin link will not show. Not verified with a real admin session.
- **A build now reads the database** to prerender the page. An unreachable database does not fail the deploy (tested), but the page then loads its cards in the browser for up to 10 minutes.
- **Stale snapshot after an edit.** The first visit after an admin edit still gets the previous page. Browsers that already have the page keep their copy for up to 5 minutes of client-side navigation (Next's default for static routes).
- **Overlay ordering.** A member can change a stage in the fraction of a second before their overlay arrives. If that change has been saved by then, the overlay leaves that card's stage alone. If the save is still in flight, the overlay briefly shows the older stage and the save corrects it when it confirms. Covered by a unit test for the first case; the second was reasoned through, not tested.

## Production follow-ups

- No Vercel setting is needed. ISR and on-demand revalidation work as deployed. After the first deploy, confirm the build log shows `○ /hackathons` and that the response carries `x-vercel-cache: PRERENDER` or `HIT`.
- Make sure `DATABASE_URL` is available to the build step, so the first snapshot is real cards rather than the fallback.
- Decide whether the shell entrance should also go on direct visits (about 0.7 s of time-to-cards there).
- Consider resized cover images at ingest.
