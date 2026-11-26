# Perf 8: the catalog file, split

Branch `t3/catalog-split`. Follows report 7 (client-side search).

## What changed

The single browser catalog file is now four static, CDN-served files under
`/api/hackathons/catalog`:

| File | Holds | Regenerated | Downloaded |
| --- | --- | --- | --- |
| `/catalog` | cards without blurbs or vote totals | 10 min, or on edit | after the page paints |
| `/catalog/votes` | `[up, down]` by id, live | every minute | right after the catalog |
| `/catalog/descriptions` | blurbs by id | 10 min, or on edit | when a search first draws a card the page didn't come with |
| `/catalog/versions` | a fingerprint of each file (~110 B) | every minute | every minute while the tab is visible, and when it comes back into view |

- A card drawn before its blurb arrives shows three placeholder lines, filled
  in when the descriptions land.
- A card shows no score until the votes arrive. "Top voted" searches wait for
  the votes.
- An open tab re-downloads only the files whose fingerprint changed. A new
  catalog applies from the next search. New blurbs and scores update in place.

## Results

Production builds under Node 24: `main` at `1655cf4` against this branch.
Both read ep-orange-block read-only. Remote covers were blocked. Medians,
n = 5 (n = 4 on slow 3G).

**Catalog data downloaded by a visitor who doesn't search** (gzip, as `next start` sends it):
125 KB → 70 KB.

| Profile | First search right after load: cards | Its blurbs filled in | Later tab clicks |
| --- | --- | --- | --- |
| +100 ms RTT, 10 Mbps | 17.9 → 17.4 ms | 18 → 282 ms | 7.6 → 8.7 ms |
| Phone: 4× CPU, +150 ms, 5 Mbps | 80.2 → 85.6 ms | 80 → 463 ms | 28.1 → 27.9 ms |
| Slow 3G: 4× CPU, +400 ms, 1.6 Mbps | 224 → **81 ms** | 224 → 1,563 ms | 25.8 → 27.3 ms |

- Cards appear just as fast, and faster on a slow connection, where the
  smaller catalog file finishes sooner.
- The trade-off: the blurbs of the first search arrive a moment after its
  cards.
- File sizes at 310 hackathons (brotli, as Vercel serves them): catalog
  45 KB, descriptions 40 KB, votes and versions under 1 KB.

## Freshness

`next start` sends no ETag for route handlers, so a plain "has it changed?"
request would re-download the whole file. The versions file avoids depending
on the server or CDN for that: a tab that has seen no change costs 110 bytes
a minute.
