# Face Off rating system

Face Off ranks individual hackathon editions by community reputation and
anticipation. It is not an attendee-experience score. Ratings are provisional
until an edition has ten completed matchups.

## Rating algorithm

Algorithm version 2 uses standard Elo expected scores:

```text
expected(A) = 1 / (1 + 10 ^ ((rating(B) - rating(A)) / 400))
```

K is 40 below 10 games, 24 below 30, and 16 afterwards. A matchup uses the
smaller participant K for both sides. This protects established ratings and
makes every result exactly zero-sum. Stored ratings are integers.

Public ordering uses a confidence-adjusted score:

```text
score = 1500 + games / (games + 10) * (raw_elo - 1500)
```

The raw rating remains the source of truth for subsequent Elo updates. New and
unplayed editions start at a neutral 1500; prize money, sponsors, and catalog
data completeness do not affect the prior.

## Rank tiers

Each eligible, published hackathon has one global tier derived from the cached
Face Off rating set. Tiers use the confidence-adjusted score above, with the
hackathon id as the deterministic tie-breaker:

- S: top 1%
- A: next 10%
- B: next 20%
- C: next 30%
- D: remaining 39%

The application derives rank and tier once per shared cache window. Votes only
touch the winner and loser rating rows; they never rewrite the full population.
UI filters group the global tiers returned by that cached calculation, so a
search filter cannot change a hackathon's tier.

## Request flow

1. The browser chooses a close, informative pair from the cached Face Off pool
   while avoiding recently shown hackathons.
2. `POST /api/faceoff/vote` supplies only the winner and loser ids.
3. `record_hackathon_faceoff_vote` validates eligibility, consumes one aggregate
   daily rate-limit counter, locks the two rating rows, and updates them in one
   PostgreSQL transaction.
4. The open client updates those two ratings from the response. The shared
   leaderboard endpoint is cached for one minute.

Anonymous cookie identifiers are SHA-256 hashed before being used as aggregate
rate-limit keys. Signed-in and anonymous voters are limited to 50 votes in a
fixed 24-hour window. No individual matchup or vote record is retained.

## Data and operations

- `hackathon_faceoff_ratings` is the narrow, high-churn current-state table.
- `rate_limit_buckets` retains one expiring aggregate row per active voter, not
  their choices.
- Rank and tier are calculated from the rating table and shared through the
  one-minute application/CDN cache.
- Run `pnpm audit:faceoff` for a read-only current-state consistency check.
