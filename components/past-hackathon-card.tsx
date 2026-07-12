"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ExternalLink, MapPin, Pin, Trophy } from "lucide-react";

import { HackathonResultActions } from "@/components/hackathon-result-actions";
import { MarkAttendedButton } from "@/components/mark-attended-button";
import { RemoveHackathonControl } from "@/components/remove-hackathon-control";

/* A finished hackathon in the My Hackathons "Past" list. Client-side so the
   trash button can drop the card from view once its tracking row is deleted. */
export function PastHackathonCard({
  awardName,
  dateRange,
  devpostUrl,
  hackathonId,
  hackathonName,
  isPinned,
  location,
  slug,
  status,
  userHackathonId,
}: {
  awardName: string | null;
  dateRange: string;
  devpostUrl: string | null;
  hackathonId: string;
  hackathonName: string;
  isPinned: boolean;
  location: string;
  slug: string;
  status: "attended" | "won" | "ended";
  userHackathonId: string;
}) {
  const [removed, setRemoved] = useState(false);

  if (removed) {
    return null;
  }

  const won = status === "won";
  const attended = status === "attended";

  return (
    <article className="group rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            className="text-lg font-semibold text-navy dark:text-wheat underline-offset-4 hover:text-cabernet dark:hover:text-[#e4a3ab] hover:underline"
            href={`/hackathons/${slug}`}
          >
            {hackathonName}
          </Link>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy/55 dark:text-wheat/55">
            <span className="inline-flex items-center gap-1">
              <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
              {dateRange}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              {location}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {won ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cabernet px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white">
              <Trophy aria-hidden="true" className="size-3.5" />
              Winner
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-navy/55 dark:text-wheat/55">
              {attended ? "Attended" : "Ended"}
            </span>
          )}
          {isPinned ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cabernet/25 bg-white dark:bg-white/[0.06] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-cabernet dark:text-[#e4a3ab]">
              <Pin aria-hidden="true" className="size-3.5 fill-current" />
              Pinned
            </span>
          ) : null}
          <RemoveHackathonControl
            hackathonId={hackathonId}
            hackathonName={hackathonName}
            listLabel="Past"
            onRemoved={() => setRemoved(true)}
          />
        </div>
      </div>

      {(won && awardName) || devpostUrl ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {won && awardName ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-cabernet dark:text-[#e4a3ab]">
              <Trophy aria-hidden="true" className="size-3.5 shrink-0" />
              {awardName}
            </p>
          ) : null}
          {devpostUrl ? (
            <a
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy dark:text-wheat underline-offset-4 hover:text-cabernet dark:hover:text-[#e4a3ab] hover:underline"
              href={devpostUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
              View project
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 border-t border-navy/10 dark:border-white/10 pt-4">
        {won || attended ? (
          <HackathonResultActions
            awardName={awardName}
            devpostUrl={devpostUrl}
            isPinned={isPinned}
            status={won ? "won" : "attended"}
            userHackathonId={userHackathonId}
          />
        ) : (
          <MarkAttendedButton userHackathonId={userHackathonId} />
        )}
      </div>
    </article>
  );
}
