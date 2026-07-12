"use client";

import { Fragment, useState } from "react";
import { BadgeCheck, CalendarDays, ChevronRight, FileText, MapPin, Trophy } from "lucide-react";

import { HackathonCheckinForm } from "@/components/hackathon-checkin-form";
import type { AttendanceTrustTier } from "@/lib/hackathons/attendance-rules";

export type AttendedHackathonRow = {
  id: string;
  name: string;
  date: string | null;
  location: string;
  tier: AttendanceTrustTier | null;
  isWinner: boolean;
};

function StatusCell({ tier, isWinner }: { tier: AttendanceTrustTier | null; isWinner: boolean }) {
  if (isWinner) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#D4A72C]/15 px-2 py-0.5 text-xs font-semibold text-[#9a7b1f] dark:text-[#e8c76b]">
        <Trophy aria-hidden="true" className="size-3" />
        Winner
      </span>
    );
  }

  if (tier === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-cabernet/25 bg-cabernet/5 dark:bg-[#e4a3ab]/10 px-2 py-0.5 text-xs font-semibold text-cabernet dark:text-[#e4a3ab]">
        <BadgeCheck aria-hidden="true" className="size-3" />
        Verified
      </span>
    );
  }

  if (tier === "self_reported") {
    return (
      <span className="rounded-full border border-navy/10 dark:border-white/10 px-2 py-0.5 text-xs font-semibold text-navy/55 dark:text-wheat/55">
        Self-reported
      </span>
    );
  }

  return <span className="text-sm text-navy/40 dark:text-wheat/40">—</span>;
}

// Column headers mirror the Notion database layout: a muted label preceded by a
// small icon, sitting above a divider that separates it from the rows.
const columns = [
  { label: "Hackathon", icon: FileText },
  { label: "Date", icon: CalendarDays },
  { label: "Location", icon: MapPin },
  { label: "Status", icon: BadgeCheck },
];

export function AttendedHackathonsTable({ rows }: { rows: AttendedHackathonRow[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!rows.length) {
    return <p className="text-sm text-navy/55 dark:text-wheat/55">Hackathons attended will appear here.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="border-b border-navy/10 dark:border-white/10">
            {columns.map((column) => (
              <th className="py-2 pr-4 text-sm font-normal text-navy/50 dark:text-wheat/50" key={column.label} scope="col">
                <span className="flex items-center gap-1.5">
                  <column.icon aria-hidden="true" className="size-3.5" />
                  {column.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            // Verified attendance is settled, so only self-reported rows expand
            // to reveal the organizer check-in form.
            const expandable = row.tier !== "verified";
            const isOpen = expandedId === row.id;

            return (
              <Fragment key={row.id}>
                <tr
                  className={`border-b border-navy/[0.06] dark:border-white/[0.06] ${
                    expandable ? "cursor-pointer hover:bg-navy/[0.03] dark:hover:bg-white/[0.03]" : ""
                  }`}
                  onClick={expandable ? () => setExpandedId(isOpen ? null : row.id) : undefined}
                >
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-2 font-semibold text-navy dark:text-wheat">
                      {expandable ? (
                        <ChevronRight
                          aria-hidden="true"
                          className={`size-3.5 shrink-0 text-navy/40 dark:text-wheat/40 transition-transform ${
                            isOpen ? "rotate-90" : ""
                          }`}
                        />
                      ) : (
                        <span aria-hidden="true" className="size-3.5 shrink-0" />
                      )}
                      {row.name}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-sm text-navy/60 dark:text-wheat/60">{row.date ?? "—"}</td>
                  <td className="py-3 pr-4 text-sm text-navy/60 dark:text-wheat/60">{row.location}</td>
                  <td className="py-3">
                    <StatusCell isWinner={row.isWinner} tier={row.tier} />
                  </td>
                </tr>
                {expandable && isOpen ? (
                  <tr className="border-b border-navy/[0.06] dark:border-white/[0.06]">
                    <td className="pb-4" colSpan={columns.length}>
                      <HackathonCheckinForm hackathonId={row.id} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
