"use client";

import { useState } from "react";

import { ProfileSection } from "@/components/profile/profile-primitives";
import { profileFocusRingClassName } from "@/components/profile/profile-styles";

/** `key` is the week's Sunday (YYYY-MM-DD); `count` is distinct days hacked. */
type ActivityWeek = { key: string; count: number };

export type YearActivity = {
  year: number;
  /** Every week touching the calendar year; the first can start in late December. */
  weeks: ActivityWeek[];
  /** Distinct days hacked in the year (the same rule as the all-time total). */
  totalDays: number;
  hackathonsAttended: number;
  wins: number;
};

export type LatestAttended = { name: string; dateLabel: string } | null;

function formatChartDate(value: string | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function weekClassName(count: number) {
  if (count > 2) {
    return "bg-pine";
  }

  return count > 0 ? "bg-pine/55" : "bg-ink/[0.07]";
}

export function ProfileActivity({
  years,
  latestAttended,
}: {
  years: YearActivity[];
  latestAttended: LatestAttended;
}) {
  const [selectedYear, setSelectedYear] = useState(years[0]?.year);
  const active = years.find((year) => year.year === selectedYear) ?? years[0];

  if (!active) {
    return null;
  }

  const { weeks } = active;
  // The chart is one calendar year (the loader buckets Jan 1 – Dec 31 into
  // weeks), so label it by month rather than by the edge weeks' Sundays,
  // which fall in the neighbouring year.
  const chartLabels = [
    { className: "text-left", text: `Jan ${active.year}` },
    { className: "text-center", text: "Jul" },
    { className: "text-right", text: `Dec ${active.year}` },
  ];
  const minWidth = Math.max(weeks.length * 9, 300);

  const yearPicker =
    years.length > 1 ? (
      <div aria-label="Activity year" className="flex items-center gap-1" role="group">
        {years.map((year) => {
          const selected = year.year === active.year;

          return (
            <button
              aria-pressed={selected}
              className={`min-h-11 rounded-full px-3 text-sm font-medium tabular-nums transition-colors sm:min-h-8 ${
                selected ? "bg-ink text-paper" : "text-ink/55 hover:bg-ink/[0.05] hover:text-ink"
              } ${profileFocusRingClassName}`}
              key={year.year}
              onClick={() => setSelectedYear(year.year)}
              type="button"
            >
              {year.year}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <ProfileSection aside={yearPicker} id="activity" title="Activity">
      <div className="rounded-2xl border border-ink/10 bg-surface p-4 sm:p-5">
        <p aria-live="polite" className="text-sm text-ink/70">
          <span className="font-semibold text-ink">{plural(active.hackathonsAttended, "hackathon")}</span>
          {" · "}
          {plural(active.wins, "win")}
          {" · "}
          {plural(active.totalDays, "day")} hacked in {active.year}
        </p>

        <div className="mt-4 overflow-x-auto">
          <div
            aria-label={`Weekly hackathon days in ${active.year}`}
            className="grid gap-[3px]"
            role="img"
            style={{ minWidth: `${minWidth}px`, gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
          >
            {weeks.map((week) => (
              <div
                className={`h-7 rounded-[3px] ${weekClassName(week.count)}`}
                key={week.key}
                title={`Week of ${formatChartDate(week.key)}: ${plural(week.count, "hackathon day")}`}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 text-xs text-ink/55" style={{ minWidth: `${minWidth}px` }}>
            {chartLabels.map((label) => (
              <span className={label.className} key={label.className}>
                {label.text}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-ink/10 pt-3 text-xs text-ink/55">
          {latestAttended ? (
            <p className="min-w-0">
              Latest: <span className="font-medium text-ink">{latestAttended.name}</span>
              {latestAttended.dateLabel ? ` · ${latestAttended.dateLabel}` : ""}
            </p>
          ) : (
            <span />
          )}
          <div aria-hidden="true" className="flex items-center gap-1.5">
            <span>Less</span>
            <span className="size-2.5 rounded-[2px] bg-ink/[0.07]" />
            <span className="size-2.5 rounded-[2px] bg-pine/55" />
            <span className="size-2.5 rounded-[2px] bg-pine" />
            <span>More</span>
          </div>
        </div>
      </div>
    </ProfileSection>
  );
}
