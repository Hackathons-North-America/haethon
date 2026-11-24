import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  CircleCheck,
  CircleDot,
  Clock,
  Globe,
  Landmark,
  type LucideIcon,
  MapPin,
  Medal,
  Tag as TagIcon,
  Trophy,
} from "lucide-react";

import { AddToCalendarButton } from "@/components/add-to-calendar-button";
import { DiscordGlyph } from "@/components/discord-glyph";
import { HackathonStatusTracker } from "@/components/hackathon-status-tracker";
import { HackathonVoteControl } from "@/components/hackathon-vote-control";
import { formatDateRange, formatDuration, formatLocation } from "@/lib/hackathons/card-format";
import type { HackathonPageData, HackathonViewerData } from "@/lib/hackathons/detail-data";
import { hackathonLogoSrc } from "@/lib/hackathons/logo-hosts";
import { isVotingClosed } from "@/lib/hackathons/vote-state";

function formatDeadline(date: Date | null) {
  if (!date) {
    return "TBA";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    date
  );
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function getStatusPill(status: string) {
  switch (status) {
    case "live":
      return { label: "Live now", dot: "bg-pine", pill: "bg-pine-soft text-pine" };
    case "completed":
      return {
        label: "Completed",
        dot: "bg-[#838a98] dark:bg-[#9ca3af]",
        pill: "bg-[#f4f4f6] text-[#616a7c] dark:bg-ink/[0.08] dark:text-ink/60",
      };
    default:
      return {
        label: "Upcoming",
        dot: "bg-[#B7791F] dark:bg-warning",
        pill: "bg-[#FBF3E4] text-[#8A5A00] dark:bg-warning-soft dark:text-warning-ink",
      };
  }
}

// Notion-style property row: muted label column on the left, value on the right.
function Property({
  children,
  icon: Icon,
  label,
  labelWidthClassName,
}: {
  children: ReactNode;
  icon: LucideIcon;
  label: string;
  labelWidthClassName: string;
}) {
  return (
    <div className="flex items-start gap-4 px-2 py-1.5 transition-colors hover:bg-ink/5">
      <div className={`flex shrink-0 items-center gap-2 pt-px text-sm text-ink/55 ${labelWidthClassName}`}>
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="min-w-0 flex-1 text-sm text-ink">{children}</div>
    </div>
  );
}

/* The hackathon's properties, description, actions and status tracker.
   Rendered by the full detail page and by the side panel that opens
   over the catalog; `variant` only tightens sizing for the narrower panel. */
export function HackathonDetailView({
  data,
  variant = "page",
  viewer,
}: {
  data: HackathonPageData;
  variant?: "page" | "panel";
  viewer: HackathonViewerData;
}) {
  const { hackathon, tagRows, discordChannelLink } = data;
  const panel = variant === "panel";
  const labelWidthClassName = panel ? "w-32 sm:w-40" : "w-40";
  const applyUrl = hackathon.applicationUrl ?? hackathon.websiteUrl;
  const statusPill = getStatusPill(hackathon.status);
  const propertyTags = [
    hackathon.beginnerFriendly ? "Beginner friendly" : null,
    hackathon.travelReimbursement ? "Travel support" : null,
    hackathon.highSchoolersOnly ? "High school only" : null,
    ...tagRows.map((tag) => tag.name),
  ].filter(Boolean) as string[];

  return (
    <>
      <header className={`flex items-start gap-5 ${panel ? "" : "mt-8"}`}>
        <div
          className={`relative grid shrink-0 place-items-center border border-ink/15 bg-paper ${
            panel ? "size-16" : "size-20"
          }`}
        >
          {hackathon.imageUrl ? (
            <Image
              alt={`${hackathon.name} logo`}
              className="object-contain p-2.5"
              fill
              sizes={panel ? "64px" : "80px"}
              src={hackathonLogoSrc(hackathon.id, hackathon.imageUrl)}
              unoptimized
            />
          ) : (
            <span className="text-xl font-semibold text-pine">{getInitials(hackathon.name) || "HN"}</span>
          )}
        </div>
        <div className="min-w-0 self-center">
          {/* The panel's title is an h2 so the page underneath keeps its own h1. */}
          {panel ? (
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl" id="hackathon-panel-title">
              {hackathon.name}
            </h2>
          ) : (
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{hackathon.name}</h1>
          )}
        </div>
        <HackathonVoteControl
          className="ml-auto shrink-0 self-center"
          closed={isVotingClosed(hackathon.endsAt)}
          hackathonId={hackathon.id}
          hackathonName={hackathon.name}
          initialState={viewer.votes}
          size="detail"
        />
      </header>

      <section className="mt-8">
        <p className="px-2 text-sm font-medium text-ink/55">Properties</p>
        <div className="mt-2 space-y-0.5">
          <Property icon={CalendarDays} label="Date" labelWidthClassName={labelWidthClassName}>
            <span className="font-medium">{formatDateRange(hackathon.startsAt, hackathon.endsAt)}</span>
            <span className="ml-2 text-ink/55">
              {formatDuration(hackathon.startsAt, hackathon.endsAt, hackathon.format)}
            </span>
          </Property>

          <Property icon={Clock} label="Application deadline" labelWidthClassName={labelWidthClassName}>
            <span className="font-medium">{formatDeadline(hackathon.applicationClosesAt)}</span>
          </Property>

          <Property icon={CalendarClock} label="Applications open" labelWidthClassName={labelWidthClassName}>
            <span className="font-medium">{formatDeadline(hackathon.applicationOpensAt)}</span>
          </Property>

          <Property icon={CircleCheck} label="Acceptances out" labelWidthClassName={labelWidthClassName}>
            <span className="font-medium">
              {hackathon.acceptanceAt ? formatDeadline(hackathon.acceptanceAt) : "TBA"}
            </span>
          </Property>

          <Property icon={MapPin} label="Location" labelWidthClassName={labelWidthClassName}>
            <span className="font-medium">{formatLocation(hackathon)}</span>
            {hackathon.venue ? <span className="ml-2 text-ink/55">{hackathon.venue}</span> : null}
          </Property>

          <Property icon={Globe} label="Format" labelWidthClassName={labelWidthClassName}>
            <span className="font-medium capitalize">{hackathon.format.replace("_", " ")}</span>
          </Property>

          <Property icon={Trophy} label="Prize" labelWidthClassName={labelWidthClassName}>
            <span className="font-medium">
              {hackathon.prizeAmountUsd ? `$${hackathon.prizeAmountUsd.toLocaleString("en-US")} prize pool` : "TBA"}
            </span>
          </Property>

          {hackathon.organizationName ? (
            <Property icon={Landmark} label="Source" labelWidthClassName={labelWidthClassName}>
              <span className="font-medium">{hackathon.organizationName}</span>
            </Property>
          ) : null}

          {propertyTags.length ? (
            <Property icon={TagIcon} label="Tags" labelWidthClassName={labelWidthClassName}>
              <div className="flex flex-wrap gap-1.5">
                {propertyTags.map((tag) => (
                  <span className="bg-pine/10 px-2 py-0.5 text-xs font-medium text-pine" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </Property>
          ) : null}

          <Property icon={Medal} label="Community rank" labelWidthClassName={labelWidthClassName}>
            {viewer.votes.tier ? (
              <span className="font-medium">Tier {viewer.votes.tier}</span>
            ) : (
              <span className="font-medium text-ink/55">Unranked</span>
            )}
          </Property>

          <Property icon={CircleDot} label="Status" labelWidthClassName={labelWidthClassName}>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-sm font-medium ${statusPill.pill}`}>
              <span aria-hidden="true" className={`size-1.5 rounded-full ${statusPill.dot}`} />
              {statusPill.label}
            </span>
          </Property>
        </div>
      </section>

      {hackathon.shortDescription ? (
        <section className="mt-8">
          <p className="px-2 text-sm font-medium text-ink/55">Description</p>
          <p className="mt-2 max-w-[640px] px-2 text-base leading-7 text-ink/70">{hackathon.shortDescription}</p>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Actions</h2>
        <div className="mt-2 flex flex-wrap gap-3">
          {hackathon.startsAt ? (
            <AddToCalendarButton
              description={hackathon.shortDescription}
              endsAt={(hackathon.endsAt ?? hackathon.startsAt).toISOString()}
              location={
                hackathon.format === "online"
                  ? "Online"
                  : [hackathon.venue, hackathon.city, hackathon.region, hackathon.country].filter(Boolean).join(", ")
              }
              startsAt={hackathon.startsAt.toISOString()}
              title={hackathon.name}
              url={hackathon.websiteUrl}
            />
          ) : null}
          {applyUrl ? (
            <a
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium text-ink transition-colors hover:bg-pine hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
              href={applyUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Website link
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </a>
          ) : null}
          {discordChannelLink ? (
            <a
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium text-ink transition-colors hover:bg-[#5865F2] hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
              href={discordChannelLink}
              rel="noopener noreferrer"
              target="_blank"
            >
              <DiscordGlyph className="size-4" />
              Chat on Discord
            </a>
          ) : null}
          {hackathon.websiteUrl && hackathon.websiteUrl !== applyUrl ? (
            <a
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
              href={hackathon.websiteUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Event website
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </a>
          ) : null}
        </div>
      </section>

      <section className={`mt-8 ${panel ? "py-5" : "p-5"}`}>
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Your status</h2>
        <p className="mt-2 text-sm text-ink/55">Track your interest, application, or plans to attend.</p>
        <div className="mt-4">
          {viewer.userId ? (
            <HackathonStatusTracker hackathonId={hackathon.id} initialStatus={viewer.trackedStatus} />
          ) : (
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-full px-5 text-sm font-medium text-ink transition-colors hover:bg-pine hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
              href="/sign-in"
            >
              Sign in to track this hackathon
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
