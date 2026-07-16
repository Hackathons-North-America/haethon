import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, ne, or } from "drizzle-orm";

import { CountryAlertSection } from "@/components/country-alert-section";
import type { HackathonCardData, HackathonCardReminder } from "@/components/hackathon-card";
import { MyPipelineBoard } from "@/components/my-pipeline-board";
import type { PipelineColumn } from "@/components/my-pipeline-board";
import { PastHackathonCard } from "@/components/past-hackathon-card";
import { getCurrentUserRecord } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  countryAlertSubscriptions,
  hackathonDates,
  hackathonLocations,
  hackathons,
  userHackathonNotificationPreferences,
  userHackathons,
} from "@/lib/db/schema";
import { formatDateRange, formatLocation, formatLocationParts } from "@/lib/hackathons/card-format";
import { getHackathonIdsWithDiscord } from "@/lib/hackathons/discord-cards";
import { getPrimarySourceByHackathon } from "@/lib/hackathons/source-badges";
import type { HackathonSourceBadge } from "@/lib/hackathons/source-badges";
import { reminderTypeLabels } from "@/lib/hackathons/reminder-labels";
import {
  computeSelectableReminderPlan,
  getSelectableReminderTypesForStatus,
} from "@/lib/hackathons/reminder-plan";

export const metadata: Metadata = {
  title: "My Hackathons | Hackathons North America",
  description: "Track where you stand with every hackathon, from interested to accepted.",
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
  imageUrl: string | null;
  venue: string | null;
  format: "online" | "in_person";
  voteDisplayOffset: number;
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

function toCardData(row: PipelineRow, hasDiscord: boolean, source: HackathonSourceBadge | null): HackathonCardData {
  const location = formatLocationParts(row);

  return {
    country: location.country,
    date: formatDateRange(row.startsAt, row.endsAt),
    hasDiscord,
    id: row.hackathonId,
    image: row.imageUrl,
    isSaved: true,
    location: location.locality ?? "Location TBA",
    name: row.hackathonName,
    slug: row.slug,
    source,
    userVote: 0,
    voteDisplayOffset: row.voteDisplayOffset,
    voteScore: row.voteScore,
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
      imageUrl: hackathons.imageUrl,
      venue: hackathons.venue,
      format: hackathons.format,
      voteDisplayOffset: hackathons.voteDisplayOffset,
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
  const [discordHackathonIds, sourceByHackathon, preferenceRows, countryAlertRows] = await Promise.all([
    getHackathonIdsWithDiscord(rows.map((row) => ({ id: row.hackathonId, seriesId: row.seriesId }))),
    getPrimarySourceByHackathon(rows.map((row) => row.hackathonId)),
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
    db
      .select({
        country: countryAlertSubscriptions.country,
        frequency: countryAlertSubscriptions.frequency,
      })
      .from(countryAlertSubscriptions)
      .where(eq(countryAlertSubscriptions.userId, user.id))
      .limit(1),
  ]);

  const countryAlert = countryAlertRows[0] ?? null;

  // Reminder toggles default to disabled (opt-in), matching the reminder sync;
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
        enabled: enabledByKey.get(`${row.hackathonId}:${type}`) ?? false,
      }));

    return { hackathonId: row.hackathonId, options, statusLabel };
  }

  const pipelineColumns: PipelineColumn[] = stageOrder.map((stage) => ({
    stage,
    title: stageTitles[stage],
    cards: (byStage.get(stage) ?? []).map((row) => ({
      userHackathonId: row.id,
      hackathonId: row.hackathonId,
      card: toCardData(row, discordHackathonIds.has(row.hackathonId), sourceByHackathon.get(row.hackathonId) ?? null),
      reminder: toReminder(row, stageTitles[stage]),
    })),
  }));

  return (
    <main className="min-h-screen px-5 pb-20 pt-14 text-navy dark:text-wheat sm:px-8 sm:pt-16 lg:px-12">
      <div className="mx-auto w-full max-w-[1400px]">
        <CountryAlertSection subscription={countryAlert} />

        {activeCount === 0 ? (
          <div className="mx-auto mt-10 w-full max-w-[980px] rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 p-8 text-center">
            <p className="text-base font-semibold text-navy dark:text-wheat">Nothing in your pipeline yet.</p>
            <p className="mt-2 text-sm text-navy/55 dark:text-wheat/55">
              Browse the database and mark hackathons you&apos;re interested in. Deadlines and reminders will show up
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
          /* Notion-style board: drag cards between pipeline status columns. */
          <MyPipelineBoard columns={pipelineColumns} />
        )}

        {pastRows.length ? (
          <section className="mt-12 w-full border-t border-navy/10 dark:border-white/10 pt-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-navy/55 dark:text-wheat/55">Past</h2>
            <div className="mt-4 space-y-3">
              {pastRows.map((row) => {
                const status =
                  row.applicationStatus === "won"
                    ? "won"
                    : row.applicationStatus === "attended"
                      ? "attended"
                      : "ended";

                return (
                  <PastHackathonCard
                    awardName={row.awardName}
                    dateRange={formatDateRange(row.startsAt, row.endsAt)}
                    devpostUrl={row.devpostUrl}
                    hackathonId={row.hackathonId}
                    hackathonName={row.hackathonName}
                    isPinned={row.isPinned}
                    key={row.id}
                    location={formatLocation(row)}
                    slug={row.slug}
                    status={status}
                    userHackathonId={row.id}
                  />
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
