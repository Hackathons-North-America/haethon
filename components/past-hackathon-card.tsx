"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ExternalLink, MapPin, Pin, Trophy } from "lucide-react";

import { HackathonResultActions } from "@/components/hackathon-result-actions";
import { useHackathonPanelOpen } from "@/components/hackathon-side-panel";
import { MarkAttendedButton } from "@/components/mark-attended-button";
import { RemoveHackathonControl } from "@/components/remove-hackathon-control";
import { DETAIL_LINK_PREFETCH } from "@/lib/hackathons/detail-link";

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
  const panelOpen = useHackathonPanelOpen();

  if (removed) {
    return null;
  }

  const won = status === "won";
  const attended = status === "attended";

  return (
    <article className="group rounded-xl border border-ink/10 bg-paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            className="text-lg font-semibold text-ink underline-offset-4 hover:text-pine hover:underline"
            href={`/hackathons/${slug}`}
            prefetch={DETAIL_LINK_PREFETCH}
            replace={panelOpen}
            scroll={false}
          >
            {hackathonName}
          </Link>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/55">
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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pine px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-paper">
              <Trophy aria-hidden="true" className="size-3.5" />
              Winner
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-ink/10 bg-surface px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink/55">
              {attended ? "Attended" : "Ended"}
            </span>
          )}
          {isPinned ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-pine/25 bg-surface px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-pine">
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
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-pine">
              <Trophy aria-hidden="true" className="size-3.5 shrink-0" />
              {awardName}
            </p>
          ) : null}
          {devpostUrl ? (
            <a
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink underline-offset-4 hover:text-pine hover:underline"
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

      <div className="mt-4 border-t border-ink/10 pt-4">
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
