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
import { discordLinkSql, voteFieldsSql, voteStateFromRow } from "@/lib/hackathons/row-extras";
import { sourceBadge } from "@/lib/hackathons/source-provenance";
import type { HackathonSource } from "@/lib/hackathons/source-provenance";

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
  source: HackathonSource | null;
  discordUrl: string | null;
  upvotes: number;
  downvotes: number;
  viewerVote: number | null;
};

const stageOrder = ["interested", "applied", "attending"] as const;

const stageTitles: Record<(typeof stageOrder)[number], string> = {
  interested: "Interested",
  applied: "Applied",
  attending: "Attending",
};

function toCardData(row: PipelineRow): HackathonCardData {
  const location = formatLocationParts(row);

  return {
    country: location.country,
    date: formatDateRange(row.startsAt, row.endsAt),
    description: row.description,
    discordUrl: row.discordUrl,
    endsAt: row.endsAt?.toISOString() ?? null,
    format: row.format,
    hasDiscord: Boolean(row.discordUrl),
    id: row.hackathonId,
    image: row.imageUrl,
    location: location.locality ?? "Location TBA",
    name: row.hackathonName,
    slug: row.slug,
    source: row.source ? sourceBadge(row.source) : null,
    startsAt: row.startsAt?.toISOString() ?? null,
    websiteUrl: row.websiteUrl,
  };
}

export default async function MyHackathonsPage() {
  const userId = await getCurrentUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  /* The whole page in one statement. The board also needs each hackathon's
     source badge, Discord link and vote state; those used to be three more
     queries in a second round trip, issued once this one had returned the ids.
     The source is a column on the row already joined here, and the other two
     are index probes per row over a list that is only ever one person's
     pipeline. */
  const rows: PipelineRow[] = await db
    .select({
      id: userHackathons.id,
      applicationStatus: userHackathons.applicationStatus,
      isPinned: userHackathons.isPinned,
      awardName: userHackathons.awardName,
      devpostUrl: userHackathons.devpostUrl,
      hackathonId: hackathons.id,
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
      source: hackathons.source,
      discordUrl: discordLinkSql,
      ...voteFieldsSql(userId),
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
  const pipelineColumns: PipelineColumn[] = stageOrder.map((stage) => ({
    stage,
    title: stageTitles[stage],
    cards: (byStage.get(stage) ?? []).map((row) => ({
      userHackathonId: row.id,
      hackathonId: row.hackathonId,
      card: { ...toCardData(row), ...voteStateFromRow(row) },
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
              Browse hackathons
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
