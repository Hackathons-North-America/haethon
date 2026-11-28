import type { ProfilePageData, ProfileTotals } from "@/lib/profile/profile-page-data";

// Presentational only (no hooks): safe for server and client parents.

/**
 * All-time totals. `data.totals` is computed from every attendance and win
 * row; the fallback only covers a cached payload written before totals
 * existed (the public page caches ProfilePageData for up to ten minutes),
 * where summing the last three years (same per-year rules: distinct
 * hackathons, distinct won hackathons, distinct days) is the best available
 * approximation.
 */
function allTimeTotals(data: ProfilePageData): ProfileTotals {
  const totals = (data as Partial<ProfilePageData>).totals;

  if (totals) {
    return totals;
  }

  return data.yearActivity.reduce<ProfileTotals>(
    (sum, year) => ({
      hackathonsAttended: sum.hackathonsAttended + year.hackathonsAttended,
      wins: sum.wins + year.wins,
      daysHacked: sum.daysHacked + year.totalDays,
    }),
    { hackathonsAttended: 0, wins: 0, daysHacked: 0 }
  );
}

export function ProfileStats({ data }: { data: ProfilePageData }) {
  const totals = allTimeTotals(data);
  const stats = [
    { key: "hackathons", label: totals.hackathonsAttended === 1 ? "Hackathon" : "Hackathons", value: totals.hackathonsAttended },
    { key: "wins", label: totals.wins === 1 ? "Win" : "Wins", value: totals.wins },
    // "Days hacked" wraps in a 360px-wide third, so phones get "Days".
    {
      key: "days",
      label: totals.daysHacked === 1 ? "Day" : "Days",
      longLabel: totals.daysHacked === 1 ? "Day hacked" : "Days hacked",
      value: totals.daysHacked,
    },
  ];

  return (
    // A labelled region: aria-label on a bare <dl> isn't reliably announced.
    <section aria-label="Profile stats">
      <dl className="grid grid-cols-3 divide-x divide-ink/10 rounded-2xl border border-ink/10 bg-surface">
        {stats.map((stat) => (
          <div className="flex min-w-0 flex-col gap-1 px-3 py-4 sm:px-5" key={stat.key}>
            <dt className="text-xs font-semibold uppercase leading-snug tracking-wide text-ink/55 sm:tracking-[0.14em]">
              {stat.longLabel ? (
                <>
                  <span className="sm:hidden">{stat.label}</span>
                  <span className="hidden sm:inline">{stat.longLabel}</span>
                </>
              ) : (
                stat.label
              )}
            </dt>
            <dd className="order-first text-2xl font-semibold tabular-nums tracking-tight text-ink">
              {stat.value.toLocaleString("en-US")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
