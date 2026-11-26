# Perf 5: cover thumbnails on the catalog

Branch `t3/cover-thumbnails`. Scope: the cover images on `/hackathons` cards,
where they are generated (every write path that sets an image), how they are
stored, and how the card and the page's preload hint request them.

## Headline

Cards drew their cover straight from the organizer's original file: PNG
posters and photos of 9 KB to 2 MB, shown in a slot about 400–475 CSS pixels
wide. Each cover now also has a 640×320 and a 1280×640 WebP, and the card hands
the browser both as a `srcset`, so it downloads the one that fits the slot and
the screen's pixel density.

What a first visit to `/hackathons` downloads in covers, on the real network
(preloads plus Chrome's lazy-loading look-ahead, which fetches covers well
below the fold):

| First visit, unthrottled | Covers fetched | Before | After | Saved |
| --- | --- | --- | --- | --- |
| Phone (390×844, 3× DPR) | 7 | 4,673 KB | 219 KB | 95.3% |
| Desktop (1440×900, 2× DPR) | 20 | 7,818 KB | 609 KB | 92.2% |
| Desktop (1440×900, 1× DPR) | 20 | 7,818 KB | 317 KB | 95.9% |

Only the covers on the first screen:

| First screen | Covers | Before | After | Saved |
| --- | --- | --- | --- | --- |
| Phone (390×844, 3× DPR) | 1 | 130 KB | 65 KB (1280w) | 49.9% |
| Desktop (1440×900, 2× DPR), 3 columns | 3 | 3,000 KB | 134 KB (1280w) | 95.5% |
| Desktop (1440×900, 1× DPR), 3 columns | 3 | 3,000 KB | 61 KB (640w) | 98.0% |
| All 29 covers on the first catalog page, 2× / 3× DPR | 29 | 10,150 KB | 1,020 KB | 90.0% |

The phone's first-screen saving looks small only because its one visible cover
happens to be the lightest of the first three (130 KB). The page preloads the
first three covers on every device, so on a phone the other two (2,000 KB and
870 KB) were downloading at the same time and competing with it for bandwidth.

Throttled page loads (Playwright, Chromium, production build, Node 24; median
of 7 alternating runs each):

| Fresh visit to `/hackathons` | Before | After |
| --- | --- | --- |
| Phone, Slow 4G: first-screen cover loaded (= LCP) | 5,457 ms | **2,940 ms** |
| Phone, Slow 4G: cover bytes until the page stops fetching | 3,000 KB, done at ~24.1 s | **134 KB**, done at ~6.8 s |
| Desktop 2×, 10 Mbps: all 3 first-screen covers loaded | 6,318 ms | **698 ms** |
| Desktop 2×, 10 Mbps: LCP (a cover) | 6,324 ms | **580 ms** |
| Desktop 1×, 10 Mbps: all 3 first-screen covers loaded | 6,315 ms | **442 ms** |

On the phone what is left after the change is mostly the page itself (HTML
and JS over Slow 4G); the cover is no longer the long pole.

## What I found

- **Covers bypass the image optimizer.** `HackathonCard` rendered
  `next/image` with `unoptimized`, so the browser got the stored organizer URL
  as is. `unoptimized` also means no `srcset`: every device got the full file.
- **The originals are large for their slot.** Of the 29 covers on the first
  page, 9 are over 400 KB and the biggest is a 2,000 KB JPEG, shown at
  about 475 × 237 CSS px on desktop. Devpost's `challenge_thumbnails/.../original.png`
  files and Luma's `width=1200` PNGs make up the catalog today.
- **More is downloaded than the first screen.** Three covers are preloaded
  for every device, and Chrome's lazy loading starts fetching images well
  before they scroll into view. A desktop first visit fetched 20 covers
  (7.8 MB); a phone fetched 7 (4.7 MB) unthrottled and the 3 preloaded ones
  (3.0 MB) on Slow 4G.
- **The fix is the files, not the markup.** Lazy loading, the preload and the
  slot sizes were already reasonable. The bytes per cover were the problem.

## What changed

**Thumbnails.** `lib/hackathons/cover-thumbnails.ts` cuts two 2:1 WebP files
from the original with `sharp`: `resize(640, 320)` and `resize(1280, 640)`,
`fit: cover`, centre position (the same crop the card's `object-cover`
applies), quality 75 (next/image's default), EXIF orientation applied. They
are uploaded to UploadThing with the server-side `UTApi` and their URLs stored
in two new nullable columns, `hackathons.image_thumb_small_url` and
`image_thumb_large_url` (migration `0041_cover_thumbnails.sql`).

Two cases keep the original instead: animated images (a thumbnail would freeze
the first frame) and originals already no bigger than the 1280w WebP. One of
the 29 covers (a 44 KB PNG) is in the second group.

**When they are made.** On every write that sets or changes a cover:

| Path | Where |
| --- | --- |
| JSON / scraper import, new rows | `vetImportedImages` in `review-service.ts` (was `dropUnreachableImages`): one download now both vets the URL and feeds the resize |
| Import feed update, auto-merge, submission approval, admin create (incl. the UploadThing photo upload) | `applyFeedUpdate`, `mergeIntoHackathon`, `createPublishedHackathon` |
| Admin and organizer edits | `updatePublishedHackathon` (resizes the bytes `assertReachableImageUrl` already downloaded) |

The work runs after the response, through `afterResponse()` (`next/server`
`after()` in a request; awaited inline in scripts and tests), so no response
waits for it. The JSON import keeps passing its own `defer`. Everything is
best-effort: a failure is logged to Sentry (`feature: cover-thumbnails`) and
the card keeps the original.

**Consistency.** The write that changes `image_url` clears both thumbnail
columns in the same statement, so a card can never show thumbnails of an
older image. The background job writes its URLs only
`WHERE image_url = <the image it resized> AND image_thumb_small_url IS NULL`;
if that matches nothing (the image changed again meanwhile), it deletes the
files it just uploaded.

**Deletes.** When an image is replaced or removed, or the hackathon is
deleted, the old thumbnails are deleted from UploadThing after the response
(best-effort). Only UploadThing file URLs (`*.ufs.sh/f/<key>`, `utfs.io/f/<key>`)
are ever turned into delete keys.

**The card.** The cover is now a plain `<img>` (`CardCoverImage` in
`components/hackathon-card.tsx`) with `loading="lazy"`, `decoding="async"`
and the same absolute fill and `object-cover`, so the look is unchanged. With
thumbnails it gets `src` = 640w, `srcset` = 640w + 1280w and
`sizes="(min-width: 90rem) 33vw, (min-width: 640px) 50vw, 100vw"`. The old
`sizes` said `33vw` from 1024px, but the grid only goes to three columns at
90rem (1440px). If a thumbnail fails to load, the card switches to the
original. Without thumbnails it renders the original, as before. The choice
lives in `coverImageAttributes()` (`lib/hackathons/cover-image.ts`), which
the page's preload also uses, so the hint (`imageSrcSet` / `imageSizes`)
always describes what the card requests.

**Not changed:** the 56–80px square logos on the bookmark card and the detail
page. They use `object-contain` on the full original, and a 2:1 crop would
cut the top and bottom off a square logo.

**Catalog data.** `imageThumbSmall` / `imageThumbLarge` are added to the
snapshot select and to `PublicHackathonCard`. Nothing else in `catalog.ts`,
`catalog-snapshot.ts`, `hackathon-search.tsx` or `hackathon-catalog.tsx`
changed, to stay out of the way of `t3/client-side-search`. They add about
180 bytes per card (two UploadThing URLs) to the snapshot.

**Backfill.** `pnpm backfill:cover-thumbnails [--dry-run] [--limit N]
[--concurrency N]` (default concurrency 3) processes hackathons that have an
image and no thumbnails, published ones first. Rows with thumbnails are never
touched, so it is safe to re-run; a row that failed is simply retried next
time. It does not revalidate the cache; the catalog picks the thumbnails up at
its next refresh.

## Timings

Each row: median (min–max) over 7 runs, ms from navigation start. "First
cover" and "all first-screen covers" are polled per frame (download +
decode); "downloads done" is the last of their `responseEnd`s; "settled" is
the point after which no cover request was in flight for 2 s.

| Profile | Metric | Before | After |
| --- | --- | --- | --- |
| Phone (390×844, 3× DPR), Slow 4G | First cover loaded | 5,457 (5,436–5,474) | 2,940 (2,932–2,944) |
| | All first-screen covers (1) | 5,457 (5,436–5,474) | 2,940 (2,932–2,944) |
| | Their downloads done | 5,452 (5,430–5,468) | 2,933 (2,925–2,941) |
| | LCP (the cover `<img>`) | 5,460 (5,440–5,476) | 2,944 (2,940–2,956) |
| | Cover bytes once settled | 3,000 KB | 134 KB |
| | Settled at | 24,082 (24,060–24,117) | 6,764 (6,258–7,525) |
| Desktop (1440×900, 2× DPR), 10 Mbps / 40 ms | First cover loaded | 1,603 (1,597–1,611) | 531 (521–538) |
| | All first-screen covers (3) | 6,318 (6,314–6,321) | 698 (696–705) |
| | Their downloads done | 6,312 (6,308–6,315) | 696 (693–705) |
| | LCP (a cover `<img>`) | 6,324 (6,320–6,344) | 580 (572–592) |
| | Cover bytes once settled | 6,509 KB | 361 KB |
| | Settled at | 6,637 (6,379–7,888) | 4,026 (3,519–4,280) |
| Desktop (1440×900, 1× DPR), 10 Mbps / 40 ms | First cover loaded | 1,603 (1,598–1,619) | 313 (306–322) |
| | All first-screen covers (3) | 6,315 (6,306–6,325) | 442 (437–458) |
| | Their downloads done | 6,309 (6,306–6,317) | 436 (432–456) |
| | LCP (a cover `<img>`) | 6,320 (6,320–6,336) | 368 (364–376) |
| | Cover bytes once settled | 6,509 KB | 181 KB |
| | Settled at | 6,879 (6,379–8,128) | 3,789 (3,258–4,269) |

The spread is under 2% in every row except "settled at", which depends on
when the 2 s idle window closes. Throttled, Chrome's lazy-loading look-ahead
fetched 18 covers on desktop (unthrottled: 20) and only the 3 preloaded ones
on the phone.

**Look.** I composited the three heaviest originals and their 1280w WebP at
the 2× desktop card size (950×475) side by side: same crop, no visible
difference.

## Method

```sh
# Baseline: a production build of main (da1f533), read-only against ep-orange-block
DATABASE_URL=<ep-orange-block> pnpm build
DATABASE_URL=<ep-orange-block> npx -y node@24 node_modules/next/dist/bin/next start -p 3121

# Harness (Node 24.22.3, the Vercel runtime)
BENCH_DIR=<dir> npx -y node@24 node_modules/tsx/dist/cli.mjs scripts/perf/cover-thumbnails-bench.ts discover
#   … download, bytes, verify, timing --runs 7
```

- **Why the baseline build serves both cases.** This branch's catalog query
  selects the new columns, and no remote database has them (migrating one was
  off limits). So both cases load the same production build of `main` and the
  harness swaps only the cover bytes. That is equivalent for the network: the
  branch's markup issues one request per cover, for the file `srcset` picks,
  exactly as the baseline's issues one request for the original.
- **Which covers.** `discover` loads `/hackathons` per device profile and
  records every card cover and whether it is on the first screen.
- **The "after" bytes are real thumbnails of the real covers.** `download`
  fetches each original through the app's own `fetchSafeRemoteImage` (plain
  GETs; cap raised to 32 MB for the measurement) and cuts the thumbnails with
  the app's own `renderCoverThumbnails()`. Nothing was uploaded.
- **The baseline bytes match what browsers get.** `verify` loads the page on
  the real network and compares each cover response with the downloaded
  copy: 0 mismatches beyond 1% (the residue is HTTP framing in Playwright's
  size count; formats were identical, so Luma's CDN did not negotiate a
  different format for the browser's `Accept` header).
- **Which thumbnail a device gets.** The candidate Chromium picks for width
  descriptors: the smallest whose width ≥ slot width × DPR. Desktop 1440px
  slot is 480px, so 1× → 640w and 2× → 1280w; a 390px phone at 3× needs 1170 →
  1280w.
- **Timing.** Chromium resolves every host except `localhost` to a local
  HTTP/2 server (self-signed), which answers each cover URL with the original
  ("before") or the thumbnail the device would pick ("after"), and a 404 for
  anything else in both cases. Each run is a fresh browser context with the
  cache disabled and DevTools network throttling (Slow 4G for the phone:
  150 ms RTT, 1.6 Mbps down, 750 kbps up; 40 ms / 10 Mbps for desktop). Cases
  alternate before/after so drift hits both. "First screen covers loaded" is
  polled per animation frame (download + decode) from navigation start; LCP
  comes from a `PerformanceObserver`. "Settled" waits until no cover request
  is in flight for 2 s.
- **Noise.** Other agents were building and benchmarking on this machine at
  the same time. The byte counts are exact and are the headline; the timings
  are dominated by the throttled transfer, so the noise shows up mostly in
  the max column.

## Tests

- `tests/unit/cover-image.test.ts`: src selection (srcset only with both
  thumbnails, original otherwise, forced original after an error, no
  srcset-breaking URLs) and UploadThing key parsing (never a non-UploadThing
  URL).
- `tests/unit/cover-thumbnails.test.ts`: the real resize (sizes, formats,
  portrait crop, animated and not-smaller skips, undecodable input) and the
  generate path with storage stubbed (stored, fetch when no bytes, unreachable,
  stale run cleans up, upload failure and bad bytes reported without
  throwing).
- `tests/unit/card-cover-image.test.ts`: the rendered `<img>` (srcset, sizes,
  lazy), the original fallback, the switch on a load error, and the preload
  link carrying the same `imageSrcSet` / `imageSizes`.
- `tests/integration/cover-thumbnails.test.ts` (local Postgres, migrations
  through 0041, real sharp, UploadThing stubbed): import → thumbnails stored →
  in the catalog cards; dead import image cleared; edit to a new image replaces
  and deletes; unchanged edit keeps; removed image clears and deletes; delete
  deletes; a run that lost a race is discarded; the backfill's dry run,
  idempotence and failure handling.

## Risks

- **Background time budget.** Thumbnails for an import run inside the import
  route's `after()`, under its `maxDuration` of 60 s, at 4 at a time. At
  roughly 1–2 s per cover (fetch, resize, two uploads) that covers well over a
  hundred new covers per request; any left over when the function stops keep
  their original until the backfill is run again.
- **Storage.** 8–230 KB per hackathon in UploadThing (both sizes, about 53 KB
  on average); the 28 thumbnailed covers above total 1.5 MB. The old thumbnails of a replaced image are
  deleted, so storage tracks the catalog's size.
- **A tiny race on edits.** If an edit lands in the moment between a previous
  run's upload and its conditional write, that run's files can be left
  orphaned in UploadThing (never shown). Costs storage only.
- **Upscaling.** A cover narrower than 1280 px still gets a 1280w file; the
  "not-smaller" rule drops thumbnails only when that file would outweigh the
  original.

## Prod follow-ups

1. Run `pnpm db:migrate` on `ep-dark-bread`. Its journal stops at 0037, so
   this also applies 0038–0040 from earlier PRs, then 0041.
2. Deploy. New and edited covers get thumbnails from then on
   (`UPLOADTHING_TOKEN` is already set).
3. Run `pnpm backfill:cover-thumbnails --dry-run`, then
   `pnpm backfill:cover-thumbnails`, against the production `DATABASE_URL`
   with `UPLOADTHING_TOKEN` set. Re-run it any time; it only does what is
   missing.
