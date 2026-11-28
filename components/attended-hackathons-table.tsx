"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { HackathonCheckinForm } from "@/components/hackathon-checkin-form";
import { ProfileStatusPill } from "@/components/profile/profile-primitives";
import type { AttendanceTrustTier } from "@/lib/hackathons/attendance-rules";

export type AttendedHackathonRow = {
  id: string;
  name: string;
  date: string | null;
  location: string;
  tier: AttendanceTrustTier | null;
  isWinner: boolean;
};

function StatusPill({ tier, isWinner }: { tier: AttendanceTrustTier | null; isWinner: boolean }) {
  if (isWinner) {
    return <ProfileStatusPill status="winner" />;
  }

  return tier ? <ProfileStatusPill status={tier} /> : null;
}

/** Row dates arrive as YYYY-MM-DD (date-only, UTC); show them as "Mar 2026". */
function formatRowDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

// Fixed desktop column widths, so every row's date, location, status and
// chevron line up whatever a row contains.
const dateColumnClassName = "w-[4.75rem] shrink-0";
const locationColumnClassName = "w-44 shrink-0";
const statusColumnClassName = "w-[6.5rem] shrink-0";

/**
 * Separated by a leading dot that sits in the gap before each item. The list
 * is shifted left by one gap inside an overflow-hidden wrapper, so the dot of
 * whichever item starts a line is clipped: a dot only ever appears between
 * two items on the same line, never dangling at a line's end.
 */
const dottedListClassName = "-ml-3 flex flex-wrap gap-y-1";
const dottedItemClassName =
  "relative min-w-0 pl-3 before:absolute before:left-1 before:text-ink/35 before:content-['·']";

/**
 * Name, then date and location. On phones the status pill leads the meta
 * line so long names keep the full width; from sm up every field has its
 * own fixed-width column.
 */
function RowSummary({ row }: { row: AttendedHackathonRow }) {
  const date = formatRowDate(row.date);

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
      <span className="min-w-0 truncate font-medium text-ink sm:flex-1">{row.name}</span>

      {/* Phones: one wrapping meta line. */}
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink/55 sm:hidden">
        <StatusPill isWinner={row.isWinner} tier={row.tier} />
        <span className="min-w-0 max-w-full overflow-hidden">
          <span className={dottedListClassName}>
            {date ? (
              <span className={`${dottedItemClassName} shrink-0 tabular-nums`}>
                <time dateTime={row.date ?? undefined}>{date}</time>
              </span>
            ) : null}
            <span className={`${dottedItemClassName} truncate`}>{row.location}</span>
          </span>
        </span>
      </span>

      {/* sm and up: fixed columns, kept even when a value is missing. */}
      <span className={`hidden text-sm tabular-nums text-ink/55 sm:block ${dateColumnClassName}`}>
        {date ? <time dateTime={row.date ?? undefined}>{date}</time> : null}
      </span>
      <span className={`hidden truncate text-sm text-ink/55 sm:block ${locationColumnClassName}`} title={row.location}>
        {row.location}
      </span>
      <span className={`hidden sm:flex ${statusColumnClassName}`}>
        <StatusPill isWinner={row.isWinner} tier={row.tier} />
      </span>
    </span>
  );
}

export function AttendedHackathonsTable({
  rows,
  readOnly = false,
  emptyText = "Hackathons attended will appear here.",
}: {
  rows: AttendedHackathonRow[];
  /** Visitors of a shared profile see the data but never the check-in form. */
  readOnly?: boolean;
  emptyText?: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const idPrefix = useId();

  if (!rows.length) {
    return <p className="text-sm text-ink/55">{emptyText}</p>;
  }

  return (
    <ul className="divide-y divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-surface">
      {rows.map((row) => {
        // Verified attendance is settled, so only self-reported rows expand
        // to reveal the organizer check-in form.
        const expandable = !readOnly && row.tier !== "verified";
        const isOpen = expandedId === row.id;
        const panelId = `${idPrefix}-checkin-${row.id}`;

        if (!expandable) {
          return (
            <li className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5" key={row.id}>
              <RowSummary row={row} />
              {/* Holds the chevron's slot so columns match expandable rows. */}
              {readOnly ? null : <span aria-hidden="true" className="size-4 shrink-0" />}
            </li>
          );
        }

        return (
          <li key={row.id}>
            <button
              aria-controls={isOpen ? panelId : undefined}
              aria-expanded={isOpen}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pine sm:px-5"
              onClick={() => setExpandedId(isOpen ? null : row.id)}
              type="button"
            >
              <RowSummary row={row} />
              <ChevronDown
                aria-hidden="true"
                className={`size-4 shrink-0 text-ink/40 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
              <span className="sr-only">{isOpen ? "Hide check-in" : "Verify attendance"}</span>
            </button>
            {isOpen ? (
              <div className="border-t border-ink/10 bg-paper/60 px-4 pb-4 sm:px-5" id={panelId}>
                <HackathonCheckinForm hackathonId={row.id} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
