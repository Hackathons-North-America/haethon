import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, ne, or } from "drizzle-orm";

import type { HackathonCardData } from "@/components/hackathon-card";
import { MyPipelineBoard } from "@/components/my-pipeline-board";
import type { PipelineColumn } from "@/components/my-pipeline-board";
import { PastHackathonCard } from "@/components/past-hackathon-card";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { hackathonDates, hackathonLocations, hackathons, userHackathons } from "@/lib/db/schema";
import { formatDateRange, formatLocation, formatLocationParts } from "@/lib/hackathons/card-format";
import { getDiscordLinksByHackathon } from "@/lib/hackathons/discord-cards";
import { getPrimarySourceByHackathon } from "@/lib/hackathons/source-badges";
import type { HackathonSourceBadge } from "@/lib/hackathons/source-badges";

export const metadata: Metadata = {
  title: "My Hackathons | Hackathons North America",
  description: "Track where you stand with every hackathon, from Interested to Attending.",
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
  websiteUrl: string | null;
  venue: string | null;
  format: "online" | "in_person";
  city: string | null;
  region: string | null;
  country: string | null;
  description: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

const stageOrder = ["interested", "applied", "attending"] as const;

const stageTitles: Record<(typeof stageOrder)[number], string> = {
  interested: "Interested",
  applied: "Applied",
  attending: "Attending",
};

function toCardData(
  row: PipelineRow,
  discordUrl: string | null,
  source: HackathonSourceBadge | null
): HackathonCardData {
  const location = formatLocationParts(row);

  return {
    country: location.country,
    date: formatDateRange(row.startsAt, row.endsAt),
    description: row.description,
    discordUrl,
    endsAt: row.endsAt?.toISOString() ?? null,
    format: row.format,
    hasDiscord: Boolean(discordUrl),
    id: row.hackathonId,
    image: row.imageUrl,
    location: location.locality ?? "Location TBA",
    name: row.hackathonName,
    slug: row.slug,
    source,
    startsAt: row.startsAt?.toISOString() ?? null,
    websiteUrl: row.websiteUrl,
  };
}

export default async function MyHackathonsPage() {
  const userId = await getCurrentUserId();

  if (!userId) {
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
      websiteUrl: hackathons.websiteUrl,
      venue: hackathons.venue,
      format: hackathons.format,
      city: hackathonLocations.city,
      region: hackathonLocations.region,
      country: hackathonLocations.country,
      description: hackathons.shortDescription,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
    })
    .from(userHackathons)
    .innerJoin(hackathons, eq(hackathons.id, userHackathons.hackathonId))
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(
      and(
        eq(userHackathons.userId, userId),
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
  const [discordLinks, sourceByHackathon] = await Promise.all([
    getDiscordLinksByHackathon(rows.map((row) => ({ id: row.hackathonId, seriesId: row.seriesId }))),
    getPrimarySourceByHackathon(rows.map((row) => row.hackathonId)),
  ]);

  const pipelineColumns: PipelineColumn[] = stageOrder.map((stage) => ({
    stage,
    title: stageTitles[stage],
    cards: (byStage.get(stage) ?? []).map((row) => ({
      userHackathonId: row.id,
      hackathonId: row.hackathonId,
      card: toCardData(row, discordLinks.get(row.hackathonId) ?? null, sourceByHackathon.get(row.hackathonId) ?? null),
    })),
  }));

  return (
    <main className="min-h-screen px-5 pb-20 pt-14 sm:px-8 sm:pt-16 lg:px-12">
      <div className="mx-auto w-full max-w-[1400px]">
        {activeCount === 0 ? (
          <div className="mx-auto mt-10 w-full max-w-[980px] border border-ink/15 p-8 text-center">
            <p className="text-base font-semibold text-ink">Nothing in your pipeline yet.</p>
            <p className="mt-2 text-sm text-ink/55">
              Browse the database and mark hackathons you&apos;re interested in. They&apos;ll show up here.
            </p>
            <Link
              className="mt-6 inline-flex min-h-10 items-center justify-center rounded-full px-5 text-sm font-medium text-ink transition-colors hover:bg-pine hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
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
          <section className="mt-12 w-full border-t border-ink/10 pt-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-ink/55">Past</h2>
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
