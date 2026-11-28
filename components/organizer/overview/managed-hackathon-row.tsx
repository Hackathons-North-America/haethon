import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ChevronRight, Globe, MapPin } from "lucide-react";

import {
  formatDateRange,
  formatLocation,
  hackathonPhase,
  initialsFor,
  phaseHint,
  type HackathonPhase,
  type OverviewHackathon,
} from "@/components/organizer/overview/overview-format";
import { hackathonLogoSrc } from "@/lib/hackathons/logo-hosts";

const phaseBadge: Record<HackathonPhase, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-success/10 text-success" },
  upcoming: { label: "Upcoming", className: "bg-pine-soft text-pine" },
  ended: { label: "Ended", className: "bg-ink/5 text-ink/55" },
  tbd: { label: "Dates TBD", className: "border border-dashed border-ink/20 text-ink/55" },
};

/* Publication states worth flagging next to the timing badge; a published
   (upcoming/live/completed) event needs no extra label. */
const publicationBadge: Partial<Record<string, string>> = {
  draft: "Draft",
  archived: "Archived",
};

function Badges({ phase, status }: { phase: HackathonPhase; status: string }) {
  const badge = phaseBadge[phase];
  const publication = publicationBadge[status];

  return (
    <>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
      >
        {phase === "live" ? <span aria-hidden="true" className="size-1.5 rounded-full bg-success" /> : null}
        {badge.label}
      </span>
      {publication ? (
        <span className="inline-flex items-center rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning-ink">
          {publication}
        </span>
      ) : null}
    </>
  );
}

function HackathonThumb({ item }: { item: OverviewHackathon }) {
  return (
    <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-ink/10 bg-paper">
      {item.imageUrl ? (
        <Image
          alt=""
          className="object-contain p-1.5"
          fill
          sizes="48px"
          src={hackathonLogoSrc(item.id, item.imageUrl)}
          unoptimized
        />
      ) : (
        <span aria-hidden="true" className="grid size-full place-items-center bg-pine-soft text-sm font-semibold text-pine">
          {initialsFor(item.name)}
        </span>
      )}
    </div>
  );
}

/* One hackathon in the overview list. The whole row is the link into that
   hackathon's own console page. */
export function ManagedHackathonRow({ item, now }: { item: OverviewHackathon; now: Date }) {
  const phase = hackathonPhase(item, now);
  const hint = phaseHint(item, phase, now);
  const LocationIcon = item.format === "online" ? Globe : MapPin;

  return (
    <Link
      className="group flex min-h-[4.5rem] items-center gap-3 px-4 py-3 hover:bg-ink/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pine sm:gap-4 sm:px-5"
      href={`/organizer/${item.id}`}
    >
      <HackathonThumb item={item} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink sm:text-base">{item.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/55 sm:text-sm">
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
            {formatDateRange(item.startsAt, item.endsAt)}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <LocationIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{formatLocation(item)}</span>
          </span>
          {hint ? <span className="hidden font-medium text-ink/70 md:inline">{hint}</span> : null}
        </div>
        {/* Below sm the badges drop under the meta line so the name keeps the row's width. */}
        <div className="mt-2 flex flex-wrap gap-1.5 sm:hidden">
          <Badges phase={phase} status={item.status} />
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
        <Badges phase={phase} status={item.status} />
      </div>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-ink/35 group-hover:text-ink/70"
      />
    </Link>
  );
}
