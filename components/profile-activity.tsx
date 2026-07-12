"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";

type ActivityWeek = { key: string; count: number };

export type YearActivity = {
  year: number;
  weeks: ActivityWeek[];
  totalDays: number;
  hackathonsAttended: number;
  wins: number;
};

export type LatestAttended = { name: string; dateLabel: string } | null;

const sectionTitleClassName = "font-serif text-4xl font-semibold tracking-[-0.035em] text-navy dark:text-wheat sm:text-5xl";

function formatChartDate(value: string | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
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
  const chartLabels = [
    { className: "text-left", text: formatChartDate(weeks[0]?.key) },
    { className: "text-center", text: formatChartDate(weeks[Math.floor(weeks.length / 2)]?.key) },
    { className: "text-right", text: formatChartDate(weeks.at(-1)?.key) },
  ];
  const minWidth = Math.max(weeks.length * 12, 320);

  return (
    <section id="activity" className="pb-2 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className={sectionTitleClassName}>Activity</h2>
        <div className="flex flex-wrap gap-2">
          {years.map((year) => (
            <button
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
                year.year === active.year
                  ? "bg-cabernet text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white"
                  : "bg-white dark:bg-white/[0.06] text-navy/55 dark:text-wheat/55 hover:text-navy dark:hover:text-wheat"
              }`}
              key={year.year}
              onClick={() => setSelectedYear(year.year)}
              type="button"
            >
              {year.year}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-sm font-semibold text-navy dark:text-wheat">
        {active.hackathonsAttended} hackathon{active.hackathonsAttended === 1 ? "" : "s"} attended in {active.year}, {active.wins} win{active.wins === 1 ? "" : "s"} in {active.year}
      </p>
      <div className="mt-3 overflow-x-auto">
        <div
          className="grid gap-1"
          style={{ minWidth: `${minWidth}px`, gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
        >
          {weeks.map((week) => (
            <div
              className={`h-8 rounded-[4px] ${
                week.count > 2 ? "bg-cabernet dark:bg-[#e4a3ab]" : week.count > 0 ? "bg-cabernet/60 dark:bg-[#e4a3ab]/60" : "bg-navy/10 dark:bg-white/10"
              }`}
              key={week.key}
              title={`Week of ${week.key}: ${week.count} attended hackathon day${week.count === 1 ? "" : "s"}`}
            />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 text-xs text-navy/55 dark:text-wheat/55" style={{ minWidth: `${minWidth}px` }}>
          {chartLabels.map((label) => (
            <span className={label.className} key={label.className}>
              {label.text}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-navy/55 dark:text-wheat/55">
          <span>Less</span>
          <span className="size-3 rounded-[3px] bg-navy/10 dark:bg-white/10" />
          <span className="size-3 rounded-[3px] bg-cabernet/60 dark:bg-[#e4a3ab]/60" />
          <span className="size-3 rounded-[3px] bg-cabernet dark:bg-[#e4a3ab]" />
          <span>More</span>
        </div>
      </div>

      {latestAttended ? (
        <div className="mt-2 flex items-center gap-2 text-sm text-navy/55 dark:text-wheat/55">
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-cabernet dark:text-[#e4a3ab]" />
          <span>
            Latest attended:{" "}
            <span className="font-semibold text-navy dark:text-wheat">{latestAttended.name}</span>
            {latestAttended.dateLabel ? ` · ${latestAttended.dateLabel}` : ""}
          </span>
        </div>
      ) : null}
    </section>
  );
}
