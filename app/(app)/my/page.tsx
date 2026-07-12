import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, ne, or } from "drizzle-orm";
import { CalendarDays, ExternalLink, MapPin, Pin, Trophy } from "lucide-react";

import { HackathonCard } from "@/components/hackathon-card";
import type { HackathonCardData, HackathonCardReminder } from "@/components/hackathon-card";
import { HackathonResultActions } from "@/components/hackathon-result-actions";
import { MarkAttendedButton } from "@/components/mark-attended-button";
import { getCurrentUserRecord } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hackathonDates,
  hackathonLocations,
  hackathons,
  userHackathonNotificationPreferences,
  userHackathons,
} from "@/lib/db/schema";
import {
  buildBadges,
  formatDateRange,
  formatDuration,
  formatLocation,
  formatLocationParts,
} from "@/lib/hackathons/card-format";
import { getHackathonIdsWithDiscord } from "@/lib/hackathons/discord-cards";
import { reminderTypeLabels } from "@/lib/hackathons/reminder-labels";
import {
  computeSelectableReminderPlan,
  getSelectableReminderTypesForStatus,
} from "@/lib/hackathons/reminder-plan";

export const metadata: Metadata = {
  title: "My Hackathons | Hackathons North America",
  description: "Track where you stand with every hackathon — from interested to accepted.",
};

type PipelineRow = {
  id: string;
  applicationStatus: string;
  isPinned: boolean;
  awardName: string | null;
  devpostUrl: string | null;
  hackathonId: string;
  seriesId: string | null;
  hackathonName: string;
  slug: string;
  shortDescription: string | null;
  websiteUrl: string | null;
  imageUrl: string | null;
  venue: string | null;
  format: "online" | "in_person";
  status: string;
  beginnerFriendly: boolean;
  travelReimbursement: boolean;
  voteScore: number;
  city: string | null;
  region: string | null;
  country: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  applicationOpensAt: Date | null;
  applicationClosesAt: Date | null;
  acceptanceAt: Date | null;
};

const stageOrder = ["interested", "applied", "accepted"] as const;

const stageTitles: Record<(typeof stageOrder)[number], string> = {
  interested: "Interested",
  applied: "Applied",
  accepted: "Accepted",
};

function toCardData(row: PipelineRow, hasDiscord: boolean): HackathonCardData {
  const location = formatLocationParts(row);

  return {
    badges: buildBadges(row),
    country: location.country,
    date: formatDateRange(row.startsAt, row.endsAt),
    description:
      row.shortDescription ?? "Event details are being verified by the Hackathons North America team.",
    duration: formatDuration(row.startsAt, row.endsAt, row.format),
    hasDiscord,
    id: row.hackathonId,
    image: row.imageUrl,
    isSaved: true,
    location: location.locality ?? "Location TBA",
    name: row.hackathonName,
    slug: row.slug,
    userVote: 0,
    voteScore: row.voteScore,
    websiteUrl: row.websiteUrl,
  };
}

export default async function MyHackathonsPage() {
  const user = await getCurrentUserRecord();

  if (!user) {
    redirect("/sign-in");
  }

  const rows = await db
    .select({
      id: userHackathons.id,
      applicationStatus: userHackathons.applicationStatus,
      isPinned: userHackathons.isPinned,
      awardName: userHackathons.awardName,
      devpostUrl: userHackathons.devpostUrl,
      hackathonId: hackathons.id,
      seriesId: hackathons.seriesId,
      hackathonName: hackathons.name,
      slug: hackathons.slug,
      shortDescription: hackathons.shortDescription,
      websiteUrl: hackathons.websiteUrl,
      imageUrl: hackathons.imageUrl,
      venue: hackathons.venue,
      format: hackathons.format,
      status: hackathons.status,
      beginnerFriendly: hackathons.beginnerFriendly,
      travelReimbursement: hackathons.travelReimbursement,
      voteScore: hackathons.voteScore,
      city: hackathonLocations.city,
      region: hackathonLocations.region,
      country: hackathonLocations.country,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
      applicationOpensAt: hackathonDates.applicationOpensAt,
      applicationClosesAt: hackathonDates.applicationClosesAt,
      acceptanceAt: hackathonDates.acceptanceAt,
    })
    .from(userHackathons)
    .innerJoin(hackathons, eq(hackathons.id, userHackathons.hackathonId))
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(
      and(
        eq(userHackathons.userId, user.id),
        or(eq(userHackathons.isSaved, true), ne(userHackathons.applicationStatus, "interested"))
      )
    )
    .orderBy(asc(hackathonDates.startsAt));

  const now = new Date();

  const byStage = new Map<string, PipelineRow[]>();
  const pastRows: PipelineRow[] = [];

  for (const row of rows) {
    const ended = row.endsAt ? row.endsAt < now : false;

    if (ended || row.applicationStatus === "attended" || row.applicationStatus === "won") {
      pastRows.push(row);
      continue;
    }

    const list = byStage.get(row.applicationStatus) ?? [];
    list.push(row);
    byStage.set(row.applicationStatus, list);
  }

  pastRows.sort((a, b) => (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0));

  const activeCount = stageOrder.reduce((total, stage) => total + (byStage.get(stage)?.length ?? 0), 0);
  const [discordHackathonIds, preferenceRows] = await Promise.all([
    getHackathonIdsWithDiscord(rows.map((row) => ({ id: row.hackathonId, seriesId: row.seriesId }))),
    db
      .select({
        hackathonId: userHackathonNotificationPreferences.hackathonId,
        type: userHackathonNotificationPreferences.type,
        enabled: userHackathonNotificationPreferences.enabled,
      })
      .from(userHackathonNotificationPreferences)
      .where(
        and(
          eq(userHackathonNotificationPreferences.userId, user.id),
          eq(userHackathonNotificationPreferences.channel, "email")
        )
      ),
  ]);

  // Reminder toggles default to enabled (opt-out), matching the reminder sync;
  // a stored row overrides that. Keyed by hackathon + reminder type.
  const enabledByKey = new Map(
    preferenceRows.map((preference) => [`${preference.hackathonId}:${preference.type}`, preference.enabled])
  );

  // Offer the reminders that fit the hacker's current stage — interested hackers
  // get application-open countdowns, applied/accepted ones get event-start
  // countdowns — and only those still in the future.
  function toReminder(row: PipelineRow, statusLabel: string): HackathonCardReminder {
    const availableReminderTypes = new Set(getSelectableReminderTypesForStatus(row.applicationStatus));
    const options = computeSelectableReminderPlan(
      {
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        applicationOpensAt: row.applicationOpensAt,
        applicationClosesAt: row.applicationClosesAt,
        acceptanceAt: row.acceptanceAt,
      },
      now
    )
      .filter(({ type }) => availableReminderTypes.has(type))
      .map(({ type, scheduledFor }) => ({
        type,
        label: reminderTypeLabels[type] ?? type,
        scheduledFor: scheduledFor.toISOString(),
        enabled: enabledByKey.get(`${row.hackathonId}:${type}`) ?? true,
      }));

    return { hackathonId: row.hackathonId, options, statusLabel };
  }

  return (
    <main className="min-h-screen px-5 pb-20 pt-14 text-navy dark:text-wheat sm:px-8 sm:pt-16 lg:px-12">
      <div className="mx-auto w-full max-w-[1400px]">
        {activeCount === 0 ? (
          <div className="mx-auto mt-10 w-full max-w-[980px] rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 p-8 text-center">
            <p className="text-base font-semibold text-navy dark:text-wheat">Nothing in your pipeline yet.</p>
            <p className="mt-2 text-sm text-navy/55 dark:text-wheat/55">
              Browse the database and mark hackathons you&apos;re interested in — deadlines and reminders will show up
              here.
            </p>
            <Link
              className="mt-6 inline-flex rounded-full min-h-10 items-center justify-center border border-cabernet dark:border-[#e4a3ab]/50 px-5 text-sm font-semibold text-cabernet dark:text-[#e4a3ab] transition-colors hover:bg-cabernet hover:text-wheat"
              href="/hackathons"
            >
              Browse the Hackathons DB
            </Link>
          </div>
        ) : (
          /* Notion-style board: one rectangle column per pipeline status. */
          <div className="mt-10 flex items-start gap-5 overflow-x-auto pb-4">
            {stageOrder.map((stage) => {
              const stageRows = byStage.get(stage) ?? [];

              return (
                <section
                  className="w-[320px] shrink-0 rounded-2xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 p-3"
                  key={stage}
                >
                  <div className="flex items-center gap-2 px-1 py-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-cabernet/10 dark:bg-[#e4a3ab]/15 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-cabernet dark:text-[#e4a3ab]">
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                      {stageTitles[stage]}
                    </span>
                    <span className="text-sm font-semibold text-navy/45 dark:text-wheat/45">{stageRows.length}</span>
                  </div>

                  <div className="mt-2 space-y-3">
                    {stageRows.map((row, index) => (
                      <HackathonCard
                        hackathon={toCardData(row, discordHackathonIds.has(row.hackathonId))}
                        index={index}
                        key={row.id}
                        reminder={toReminder(row, stageTitles[stage])}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {pastRows.length ? (
          <section className="mt-12 w-full border-t border-navy/10 dark:border-white/10 pt-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-navy/55 dark:text-wheat/55">Past</h2>
            <div className="mt-4 space-y-3">
              {pastRows.map((row) => {
                const won = row.applicationStatus === "won";
                const attended = row.applicationStatus === "attended";

                return (
                  <article className="rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 p-5" key={row.id}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link
                          className="text-lg font-semibold text-navy dark:text-wheat underline-offset-4 hover:text-cabernet dark:hover:text-[#e4a3ab] hover:underline"
                          href={`/hackathons/${row.slug}`}
                        >
                          {row.hackathonName}
                        </Link>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy/55 dark:text-wheat/55">
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                            {formatDateRange(row.startsAt, row.endsAt)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                            {formatLocation(row)}
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
                        {row.isPinned ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-cabernet/25 bg-white dark:bg-white/[0.06] px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-cabernet dark:text-[#e4a3ab]">
                            <Pin aria-hidden="true" className="size-3.5 fill-current" />
                            Pinned
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {(won && row.awardName) || row.devpostUrl ? (
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                        {won && row.awardName ? (
                          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-cabernet dark:text-[#e4a3ab]">
                            <Trophy aria-hidden="true" className="size-3.5 shrink-0" />
                            {row.awardName}
                          </p>
                        ) : null}
                        {row.devpostUrl ? (
                          <a
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-navy dark:text-wheat underline-offset-4 hover:text-cabernet dark:hover:text-[#e4a3ab] hover:underline"
                            href={row.devpostUrl}
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
                          awardName={row.awardName}
                          devpostUrl={row.devpostUrl}
                          isPinned={row.isPinned}
                          status={won ? "won" : "attended"}
                          userHackathonId={row.id}
                        />
                      ) : (
                        <MarkAttendedButton userHackathonId={row.id} />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
