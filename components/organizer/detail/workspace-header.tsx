import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, ExternalLink, Globe, MapPin } from "lucide-react";

import {
  focusRingClassName,
  secondaryButtonClassName,
  type OrganizerHackathonItem,
} from "@/components/organizer/detail/shared";
import {
  formatDateRange,
  formatLocation,
  hackathonPhase,
  initialsFor,
  type HackathonPhase,
} from "@/components/organizer/overview/overview-format";
import { hackathonLogoSrc } from "@/lib/hackathons/logo-hosts";

/* Same badge (and same phase rule) as the overview row the organizer clicked
   in on, so an event never reads "Live" in the list and "Ended" here. */
const phaseBadge: Record<HackathonPhase, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-success/10 text-success" },
  upcoming: { label: "Upcoming", className: "bg-pine-soft text-pine" },
  ended: { label: "Ended", className: "bg-ink/5 text-ink/55" },
  tbd: { label: "Dates TBD", className: "border border-dashed border-ink/20 text-ink/55" },
};

const publicationBadge: Partial<Record<string, string>> = {
  draft: "Draft",
  archived: "Archived",
};

function HeaderThumb({ item }: { item: OrganizerHackathonItem }) {
  return (
    <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-ink/10 bg-paper sm:size-16">
      {item.imageUrl ? (
        <Image
          alt=""
          className="object-contain p-2"
          fill
          sizes="64px"
          src={hackathonLogoSrc(item.id, item.imageUrl)}
          unoptimized
        />
      ) : (
        <span aria-hidden="true" className="grid size-full place-items-center bg-pine-soft text-base font-semibold text-pine">
          {initialsFor(item.name)}
        </span>
      )}
    </div>
  );
}

/* The workspace's title block: a way back to the list, what this hackathon is
   and when/where it runs, and a link out to its public page once it has one. */
export function WorkspaceHeader({
  item,
  now,
  publicPath,
}: {
  item: OrganizerHackathonItem;
  /* ISO time to judge the phase against, fixed by the caller so the server
     and client renders agree (a fresh new Date() on each side could straddle
     a start or end and mismatch on hydration). */
  now: string;
  publicPath: string | null;
}) {
  const phase = hackathonPhase(item, new Date(now));
  const badge = phaseBadge[phase];
  const publication = publicationBadge[item.status];
  const LocationIcon = item.format === "online" ? Globe : MapPin;

  return (
    <header className="space-y-4">
      <Link
        className={`-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-ink/55 hover:text-ink ${focusRingClassName}`}
        href="/organizer"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All hackathons
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <HeaderThumb item={item} />
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{item.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink/55">
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
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
                {formatDateRange(item.startsAt, item.endsAt)}
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <LocationIcon aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{formatLocation(item)}</span>
              </span>
            </div>
          </div>
        </div>

        {publicPath ? (
          <a
            className={`${secondaryButtonClassName} w-full shrink-0 sm:w-auto`}
            href={publicPath}
            rel="noopener"
            target="_blank"
          >
            View public page
            <ExternalLink aria-hidden="true" className="size-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    </header>
  );
}
