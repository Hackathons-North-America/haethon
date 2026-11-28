"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CalendarClock, CalendarOff, History, Radio, Search, X } from "lucide-react";

import { ManagedHackathonRow } from "@/components/organizer/overview/managed-hackathon-row";
import { hackathonPhase, type OverviewHackathon } from "@/components/organizer/overview/overview-format";
import { StatCard, StatStrip } from "@/components/organizer/shell/stat-card";

/* Below this many hackathons the whole list fits on a screen, so a filter box
   would only be noise. */
const FILTER_THRESHOLD = 6;

/* Past events can run to hundreds for admins; show the most recent few and
   let the rest expand on demand. A filter always searches all of them. */
const PAST_PREVIEW_COUNT = 10;

function Section({
  children,
  count,
  id,
  title,
}: {
  children: ReactNode;
  count: number;
  id: string;
  title: string;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-semibold text-ink sm:text-lg" id={id}>
          {title}
        </h2>
        <span className="text-sm tabular-nums text-ink/55">{count}</span>
      </div>
      {children}
    </section>
  );
}

function HackathonList({ items, now }: { items: OverviewHackathon[]; now: Date }) {
  return (
    <ul className="divide-y divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-surface">
      {items.map((item) => (
        <li key={item.id}>
          <ManagedHackathonRow item={item} now={now} />
        </li>
      ))}
    </ul>
  );
}

/* The organizer console's landing list: counts, an optional name filter, and
   the managed hackathons split into current/upcoming and past (grouped and
   ordered by the page with groupOverviewHackathons). `now` comes from the
   server so the badges and counts render identically on both sides. */
export function OrganizerOverview({
  current,
  now: nowIso,
  past,
}: {
  current: OverviewHackathon[];
  now: string;
  past: OverviewHackathon[];
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [query, setQuery] = useState("");
  const [showAllPast, setShowAllPast] = useState(false);

  /* "Upcoming" counts only events with a future start date; undated events
     get their own figure (shown only when there are any) instead of being
     folded in. */
  const counts = useMemo(() => {
    const tally = { live: 0, upcoming: 0, tbd: 0, past: past.length };

    for (const item of current) {
      const phase = hackathonPhase(item, now);
      if (phase === "live" || phase === "upcoming" || phase === "tbd") tally[phase] += 1;
    }

    return tally;
  }, [current, now, past.length]);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (item: OverviewHackathon) =>
    item.name.toLowerCase().includes(normalizedQuery) || (item.city?.toLowerCase().includes(normalizedQuery) ?? false);
  const filteredCurrent = normalizedQuery ? current.filter(matches) : current;
  const filteredPast = normalizedQuery ? past.filter(matches) : past;
  const visiblePast = normalizedQuery || showAllPast ? filteredPast : filteredPast.slice(0, PAST_PREVIEW_COUNT);
  const hiddenPastCount = filteredPast.length - visiblePast.length;
  const showFilter = current.length + past.length >= FILTER_THRESHOLD;

  return (
    <div className="space-y-8">
      <StatStrip label="Hackathon counts">
        <StatCard icon={Radio} label="Live now" value={counts.live} />
        <StatCard icon={CalendarClock} label="Upcoming" value={counts.upcoming} />
        {counts.tbd ? <StatCard icon={CalendarOff} label="Dates TBD" value={counts.tbd} /> : null}
        <StatCard icon={History} label="Past" value={counts.past} />
      </StatStrip>

      {showFilter ? (
        <div className="relative max-w-sm">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/40"
          />
          <input
            aria-label="Filter hackathons by name or city"
            className="min-h-11 w-full rounded-xl border border-ink/15 bg-paper py-2 pl-9 pr-10 text-sm text-ink outline-none placeholder:text-ink/40 focus:border-pine focus:ring-2 focus:ring-pine/15"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name or city"
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label="Clear filter"
              className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink/55 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-pine"
              onClick={() => setQuery("")}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
      ) : null}

      {filteredCurrent.length ? (
        <Section count={filteredCurrent.length} id="organizer-current" title="Current & upcoming">
          <HackathonList items={filteredCurrent} now={now} />
        </Section>
      ) : !normalizedQuery ? (
        /* Only past events: say so rather than silently starting at "Past". */
        <Section count={0} id="organizer-current" title="Current & upcoming">
          <p className="rounded-2xl border border-dashed border-ink/15 px-4 py-6 text-center text-sm text-ink/55 sm:px-5">
            Nothing live or upcoming right now.
          </p>
        </Section>
      ) : null}

      {filteredPast.length ? (
        <Section count={filteredPast.length} id="organizer-past" title="Past">
          <HackathonList items={visiblePast} now={now} />
          {hiddenPastCount > 0 ? (
            <button
              className="inline-flex min-h-11 items-center rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
              onClick={() => setShowAllPast(true)}
              type="button"
            >
              Show {hiddenPastCount} more
            </button>
          ) : null}
        </Section>
      ) : null}

      {normalizedQuery && !filteredCurrent.length && !filteredPast.length ? (
        <div className="rounded-2xl border border-dashed border-ink/15 p-8 text-center">
          <p className="text-sm font-semibold text-ink">No hackathons match &ldquo;{query.trim()}&rdquo;</p>
          <button
            className="mt-3 text-sm font-semibold text-pine underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
            onClick={() => setQuery("")}
            type="button"
          >
            Clear filter
          </button>
        </div>
      ) : null}
    </div>
  );
}
