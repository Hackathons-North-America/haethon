# Perf 6: JavaScript on the catalog page

Branch `t3/js-bundle-trim`, base `main` at `da1f533`. Scope: the JavaScript `/hackathons` (and
`/`) make a browser download, parse and run before the page is interactive, especially on phones.

## Result

The app's own code turned out to be a small part of the problem. Of the 376 KB of gzipped
JavaScript the `/hackathons` HTML asks for, about 31 KB is this app's code. The rest is Next.js
and React (208 KB), Clerk's React SDK (57 KB) and two Clerk scripts from its CDN (129 KB).

The one change that holds up is a small one. The search bar's five dropdown panels moved out of
the first-load bundle into the lazy chunk that already held their animation library:

| `/hackathons` | Before | After |
| --- | --- | --- |
| App first-load JS, gzip (18 scripts) | 247.2 KB | **245.9 KB** (−1.3 KB) |
| App first-load JS, raw (what the phone parses) | 817.9 KB | **808.8 KB** (−9.1 KB) |
| `hackathon-search.tsx` in first load, gzip / raw | 7.4 / 30.3 KB | **6.2 / 21.8 KB** |
| Closed dropdowns rendered on every search-bar render | 5 (incl. ~200 country rows) | **0** |
| Throttled phone: hydrated, LCP, TBT, TTI | | no measurable change (noise is larger) |
| First-load JS on `/` | 223.1 KB | 223.1 KB (no change) |

I also tried the obvious bigger move, keeping the dropdown chunk (45 KB with motion) out of the
page load until the visitor is idle or about to use the search bar. It cut phone LCP by ~0.2 s,
but on a slow phone it made the first tap on a filter take **7.4 s instead of 0.1 s**, so it is
not in this branch. See [What I tried and dropped](#what-i-tried-and-dropped).

The large wins left are third-party and need a product decision. See
[Where the rest goes](#where-the-rest-goes): Clerk's UI bundles are ~310 KB gzip on every
signed-out phone visit, and PostHog's remote add-ons are ~137 KB.

## What makes up first-load JS

Measured two ways that agree:

- **Served bytes:** every `<script src>` in the served HTML (except the `nomodule` polyfill), plus
  every `<link rel="preload" as="script">`, fetched and gzipped (Node's default level). This is
  `catalog-mobile-bench.mjs js`.
- **Attribution:** Next 16's built-in analyzer (`next analyze -o`, Turbopack), which records each
  module in each chunk and which chunks a route needs before it renders.
  `bundle-attribution.mjs` groups it by package and file. Modules are gzipped one at a time
  there, so its totals run ~20% above the served gzip. Use it for ranking, not totals.

### `/hackathons`, served (gzip KB)

| Script | Before | After |
| --- | --- | --- |
| This app's chunks (18 files) | 247.2 | 245.9 |
| `clerk.browser.js` (Clerk CDN, `<script async>`) | 84.2 | 84.2 |
| `ui.browser.js` (Clerk CDN, `<link rel="preload">`) | 44.8 | 44.8 |
| **Total the HTML asks for** | **376.2** | **374.9** |

`/`: 223.1 KB app + the same 129.0 KB Clerk = 352.1 KB, before and after.

### `/hackathons`, by contributor (analyzer, gzip KB per module)

| Contributor | Before | After |
| --- | --- | --- |
| Next.js runtime (router, client components, shared libs) | 131.6 | 131.6 |
| React + React DOM | 76.4 | 76.4 |
| Clerk SDK (`@clerk/shared`, `@clerk/react`, `@clerk/nextjs`) + TanStack Query, which `@clerk/shared/react` pulls in | 56.9 | 56.9 |
| App: `components/hackathon-search.tsx` | 7.4 | 6.2 |
| App: `components/hackathon-card.tsx` | 4.9 | 4.9 |
| `lucide-react` (~20 icons, mostly the nav's) | 4.5 | 4.0 |
| Turbopack runtime | 4.4 | 4.4 |
| App: everything else (nav, vote control, login dialog, URL/filter helpers, country list…) | 24.6 | 24.7 |

The `/` page has 7.6 KB of app code in first load. The rest is the same framework and Clerk code.

Loaded after hydration (async chunks, unchanged apart from the dropdowns):

| Chunk | Gzip (analyzer) | When |
| --- | --- | --- |
| Dropdowns: `hackathon-search-panels.tsx` + motion | 63.4 → 66.2 KB (6 + 43 KB on the wire) | right after hydration, as before |
| PostHog (`posthog-js`) | 72.2 KB | browser idle, 2 s ceiling |
| Sentry browser SDK | 69.0 KB | idle, only with `NEXT_PUBLIC_SENTRY_DSN` (unset locally) |

### Checked and fine

- **Icons tree-shake.** `lucide-react` ships one ESM module per icon, and only the ~20 used
  icons are in the bundle (0.1–0.2 KB each plus 1 KB of shared code). `react-icons` is used only
  by profile pages and is not in `/` or `/hackathons`.
- **`motion` is already off the critical path** (report 2). Its one remaining use on this page is
  the dropdowns' shared-layout morph, which CSS can't reproduce, and the constraint was no visible
  change. It stays in the lazy chunk.
- **Card code.** The disabled per-card streak (`SHOW_CARD_STREAK = false`) is already removed by
  the minifier. The card is needed for first paint.
- **TanStack Query** (12 KB) is not ours. `@clerk/shared/react` imports it, and any Clerk hook
  does too.

## What changed

### The dropdown panels moved into the lazy chunk

`components/hackathon-search.tsx`, new `components/hackathon-search-panels.tsx`.

Before, the five dropdowns (Location, Date, Features, Sort, Format) had their animated shell in a
lazy chunk (`hackathon-search-popover.tsx`, motion). Their **contents** were JSX inside
`HackathonSearch`, so the markup, the country search and its icons shipped in first load. They
were also built on every render of the search bar, closed or not. The Location panel alone renders
a row for each of about 200 countries into a popover that isn't on screen.

Now `hackathon-search-panels.tsx` holds each field's popover (`SearchPopover` + panel body) as a
presentational component. It is loaded with `next/dynamic`, `ssr: false`, through one shared
loader, so the six lazy components (five popovers and the pill) come from one chunk group and
resolve together. Load timing is unchanged: the chunk is requested during hydration, exactly as
the old `SearchPopover` chunk was.

What stayed in `hackathon-search.tsx`: all state, the URL sync, `searchHackathons`, the
`fetchOnMount` and infinite-scroll effects, geolocation, and what each pick does
(`setDatePeriod` + close, `changeSort`, …). The panels get values and callbacks as props. The
JSX moved verbatim; only the handlers became props. Two small helpers moved out with their only
users: `countryDetail()` and the `filterCountryOptions` memo. The distance pick's inline handler
became `pickDistance()`. The country search input's ref stays in the parent, so the existing
focus-on-open effect is untouched.

This keeps the merge with `t3/client-side-search` mechanical: that branch rewrites the fetch logic
and effects, and this one only replaces the five `<SearchPopover>` blocks in the render.

### Benchmark harnesses

- `scripts/perf/catalog-mobile-bench.mjs`: `js` (served bytes), `mobile` (throttled phone
  load), `tap` (first open of a dropdown on a throttled phone).
- `scripts/perf/bundle-attribution.mjs`: first-load and async chunks by package and file, from
  `next analyze`.

## What I tried and dropped

**Deferring the dropdown chunk until idle or intent.** The chunk is 45 KB on the wire (6 KB panels
+ 43 KB motion) and was requested the moment the page hydrated. On a throttled phone that falls
inside the window where the first cover image (the LCP element) is still downloading. I built a
gate: mount the dropdowns only after `load` + `requestIdleCallback` (5 s ceiling), or on the first
`pointerover`/`pointerdown`/`focusin` on the search bar.

| Throttled phone, n=10 / n=5 | Main | Deferred |
| --- | --- | --- |
| LCP (median) | 5792 ms | 5584 ms (−208 ms) |
| Hydrated, TBT, TTI | | unchanged within noise |
| Tap Date at 6 s → dropdown shown | 101 ms | **7372 ms** |

The `load` event on this profile is at 25 s, because cover images are full-size originals, so the
5 s ceiling always fired. The chunk then started ~9 s in and queued behind PostHog's add-ons and
Clerk's UI chunks on the same 1.6 Mbps link. A visitor who taps a filter early waits seconds for
the panel, which breaks "first open has no visible delay." Shortening the ceiling would only move
the LCP saving back. Reverted.

Revisit this once covers are thumbnails (`t3/cover-thumbnails`). The `load` event would then come
early enough to be a usable trigger.

## Where the rest goes

A full trace of one signed-out phone visit (4× CPU, 150 ms RTT, 1.6 Mbps), script responses only,
KB on the wire:

| Script | KB | Starts → done (ms) | Needed on `/hackathons`? |
| --- | --- | --- | --- |
| App chunks (18) | ~260 | 170 → 3700 | yes: hydration at ~3.9 s |
| Clerk `ui.browser.js` (preload) | 46 | 390 → 2200 | no Clerk component renders here |
| Clerk `clerk.browser.js` | 84 | 820 → 4100 | yes: signed-in state, nav |
| Dropdowns chunk | 49 | 3990 → 5960 | on first open |
| PostHog `posthog-js` (app chunk) | 73 | 4130 → 7800 | analytics |
| Clerk `framework_ui` / `ui-common` / `vendors_ui` / `subscriptionDetails` | 43 / 134 / 38 / 5 | 4900 → 13300 | no |
| PostHog remote: `posthog-recorder` / `surveys` / `dead-clicks` / `web-vitals` | 74 / 50 / 9 / 4 | 7800 → 12200 | session replay, surveys |
| `/` prefetch → landing page chunk (nav logo link) | 6 + 9 | 4300 → 12700 | the long task that sets TTI at ~12 s |

1. **Clerk's prebuilt UI: ~266 KB gzip per signed-out phone visit, rendered nowhere on this page.**
   `@clerk/nextjs` 7 preloads `@clerk/ui` on every page and passes it to `Clerk.load()`, which
   then fetches the UI's own chunks. The only switch is `prefetchUI={false}`, which Clerk
   documents as "for custom UIs using Control Components". With it, `Clerk.load()` gets no UI
   constructor, and `<SignIn>`, `<UserProfile>` and the sign-in modal throw. clerk-js accepts the
   UI only at load time; there is no hook to attach it later. So this needs a product decision:
   custom sign-in/profile UI (Clerk Elements or Control Components), or Clerk support for loading
   the UI on demand. **Caveat:** measured against the Clerk development instance in `.env.local`.
   I could not load the production instance locally (its key is domain-bound), so check the
   follow-up chunks there before acting on the 266 KB.
2. **PostHog add-ons: ~137 KB.** Session replay, surveys, dead-click capture and web vitals load
   from PostHog's remote config about 4 s after hydration on a phone. Turning off the unused ones
   in the PostHog project, or deferring replay, removes them. This is an analytics decision.
3. **Cover images.** Not JavaScript, but the reason the `load` event is at 25 s and LCP at 5.8 s:
   the three preloaded covers are organizers' originals. `t3/cover-thumbnails` addresses this.
4. **Framework floor: ~208 KB** (Next.js + React). Not reducible from the app.

## Measurements

### Setup

- Production builds (`next build`, Turbopack), served by `next start -p 3122` under **Node 24.22.3**
  (`npx -y node@24`, the Vercel runtime). Local Node is 26.
- `DATABASE_URL` overridden to the read-only `ep-orange-block` branch for builds and runs.
  `ep-dark-bread` lacks migration 0040, so `/hackathons` prerendered without cards there. No writes
  or migrations.
- "Before" is a clean worktree of `da1f533` built the same way, so before and after were swapped
  on the same port and measured with the same harness.
- Chromium (Playwright), a fresh context per run (empty HTTP cache), Pixel-8-sized viewport
  (412×915, DPR 2.625, touch). CDP CPU throttling 4×, network 150 ms RTT, 1.6 Mbps down,
  750 Kbps up (Lighthouse's mobile "Slow 4G").
- **Noise:** other agents were building and benchmarking on this machine throughout. The load
  average was 6.8–12.9 during the runs, so timings carry a few percent of jitter. To show that
  jitter, the runs were interleaved (before, after, before, after). Byte counts are exact and are
  the headline.

### Throttled phone, `/hackathons`, median / p95 (ms), n=10 per run

| Metric | Before (run 1) | Before (run 2) | After (run 1) | After (run 2) |
| --- | --- | --- | --- | --- |
| FCP | 808 / 988 | 812 / 836 | 816 / 992 | 828 / 860 |
| Cards visible | 745 / 884 | 752 / 764 | 755 / 889 | 758 / 789 |
| Hydrated (filter bar has React props) | 3924 / 3979 | 3937 / 3942 | 3901 / 3967 | 3914 / 3936 |
| LCP | 5792 / 5868 | 5760 / 5812 | 5740 / 5812 | 5752 / 5944 |
| TTI (last long task before 5 s quiet) | 12277 / 12384 | 12310 / 13433 | 12359 / 13384 | 12378 / 13429 |
| TBT (FCP → TTI) | 93 / 182 | 102 / 150 | 102 / 175 | 109 / 174 |
| Long tasks before TTI | 5 / 7 | 6 / 8 | 6 / 7 | 6 / 8 |
| App JS downloaded before TTI (KB) | 383 | 383 | 384 | 384 |
| Third-party JS downloaded before TTI (KB) | 445 | 445 | 450 | 450 |

Reading it:

- **Cards visible at ~750 ms** in every run. The cards are static HTML; JavaScript doesn't gate
  them (the shell's CSS entrance does).
- **Hydration at ~3.9 s** is bandwidth-bound: ~260 KB of app chunks share the link with Clerk's
  scripts and three cover images. A 1.3 KB cut is below what this setup can resolve.
- **TTI is set by the `/` prefetch**, whose landing-page chunk arrives late behind Clerk UI and
  PostHog downloads. TBT stays low (~100 ms) because no single task is long: the main thread waits
  on the network, not on parsing.
- **App JS in total** is 1 KB higher after (392.3 → 393.3 KB on the wire): moving the panels into a
  separate chunk costs a little compression and a chunk header. The bytes simply moved behind
  hydration.

### First open of a dropdown, throttled phone

Tap the Date field N ms after navigation → dropdown fully shown (`tap`, median / p95 ms):

| Tap at | Before | After | Deferred variant (dropped) |
| --- | --- | --- | --- |
| 6 s, n=5 | 74 / 111 | 104 / 110 | 7372 / 7379 |
| 9 s, n=3–5 | 108 / 113 | 110 / 118 | — |

Before and after are the same within noise.

### No visible or behavioural change

A scripted pass opened every dropdown on both builds, ran the same interactions and screenshotted
the bar and the open panel after each step. Desktop (1440×900) and phone (412×915), 15 states
each: open Location, type "can", Enter, Near me tab, switch to Date (the morph), pick a date, open
Features, toggle one, Escape, open Sort, pick Votes (refetch), More → Format, pick Online, click
outside.

**Every state was pixel-identical between before and after (0 differing pixels, 30 of 30
screenshots).** The logged UI state was identical too: focused element (the country search is
focused on open), URL, `aria-expanded`, the bar's text and the card count.

Mid-animation frames were not compared. The animation code (`hackathon-search-popover.tsx`) is
unchanged apart from a comment, and it receives the same props.

### Reproduce

```sh
DATABASE_URL=<ep-orange-block URL> npx -y node@24 node_modules/next/dist/bin/next build
DATABASE_URL=<ep-orange-block URL> npx -y node@24 node_modules/next/dist/bin/next start -p 3122 &
node scripts/perf/catalog-mobile-bench.mjs js
node scripts/perf/catalog-mobile-bench.mjs mobile --runs 10
node scripts/perf/catalog-mobile-bench.mjs tap --at 6000 --runs 5
npx -y node@24 node_modules/next/dist/bin/next analyze -o --snapshot after
node scripts/perf/bundle-attribution.mjs --snapshot after --route /hackathons
```

## Tests

- `pnpm lint`: 0 errors. 1 warning, the same one `main` has (`react-hooks/exhaustive-deps` on the
  infinite-scroll effect in `hackathon-search.tsx`).
- `pnpm typecheck`: passes.
- `pnpm test`: 41 files, 412 tests pass.
- `tests/e2e/hackathons.spec.ts` against the production build on port 3122: 3 of 3 fail on
  **both** `main` and this branch, at the same assertions. The spec predates the search-bar
  redesign (it looks for a "Countries" button and expects no "Search hackathons" button). Not
  caused by this change; worth updating separately.

## Risks

- **Two-way door.** No data, no API, no config; revert the commit to undo.
- A dropdown opened before its chunk arrives shows a beat later, as before. The chunk is requested
  at the same moment as before.
- The panels' prop list is now the contract between the search state and the dropdowns. A new
  filter must be added in both files.
