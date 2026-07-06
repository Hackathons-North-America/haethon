import { and, asc, eq, gte, ilike, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUserRecord } from "@/lib/auth";
import { db } from "@/lib/db";
import { hackathonDates, hackathonLocations, hackathons, userHackathons, userHackathonVotes } from "@/lib/db/schema";
import { hackathonSearchSchema } from "@/lib/validations/hackathon";

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const publicStatuses = ["upcoming", "live"] as const;

function formatDateRange(startsAt: Date | null, endsAt: Date | null) {
  if (!startsAt) {
    return "Dates TBA";
  }

  const start = {
    day: startsAt.getUTCDate(),
    month: monthNames[startsAt.getUTCMonth()],
    year: startsAt.getUTCFullYear(),
  };

  if (!endsAt) {
    return `${start.month} ${start.day}, ${start.year}`;
  }

  const end = {
    day: endsAt.getUTCDate(),
    month: monthNames[endsAt.getUTCMonth()],
    year: endsAt.getUTCFullYear(),
  };

  if (start.year === end.year && start.month === end.month && start.day === end.day) {
    return `${start.month} ${start.day}, ${start.year}`;
  }

  if (start.year === end.year && start.month === end.month) {
    return `${start.month} ${start.day}-${end.day}, ${start.year}`;
  }

  if (start.year === end.year) {
    return `${start.month} ${start.day}-${end.month} ${end.day}, ${start.year}`;
  }

  return `${start.month} ${start.day}, ${start.year}-${end.month} ${end.day}, ${end.year}`;
}

function formatDuration(startsAt: Date | null, endsAt: Date | null, format: string) {
  const formatLabel = format.replace("_", " ");

  if (!startsAt || !endsAt) {
    return `Duration TBA · ${formatLabel}`;
  }

  const hours = Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 3_600_000));
  const duration = hours <= 96 ? `${hours} hours` : `${Math.ceil(hours / 24)} days`;

  return `${duration} · ${formatLabel}`;
}

function formatLocation({
  city,
  country,
  format,
  region,
  venue,
}: {
  city: string | null;
  country: string | null;
  format: string;
  region: string | null;
  venue: string | null;
}) {
  if (format === "online") {
    return "Online";
  }

  const locality = [city, region].filter(Boolean).join(", ");

  return locality || venue || country || "Location TBA";
}

function buildBadges({
  beginnerFriendly,
  format,
  status,
  travelReimbursement,
}: {
  beginnerFriendly: boolean;
  format: string;
  status: string;
  travelReimbursement: boolean;
}) {
  return [
    status === "live" ? "Live now" : "Upcoming",
    format.replace("_", " "),
    beginnerFriendly ? "Beginner friendly" : null,
    travelReimbursement ? "Travel support" : null,
  ].filter(Boolean) as string[];
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const parsed = hackathonSearchSchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    country: searchParams.get("country") ?? undefined,
    countries: searchParams.getAll("countries"),
    format: searchParams.get("format") ?? undefined,
    beginnerFriendly: searchParams.get("beginnerFriendly") ?? undefined,
    travelReimbursement: searchParams.get("travelReimbursement") ?? undefined,
    startsAfter: searchParams.get("startsAfter") ?? undefined,
    startsBefore: searchParams.get("startsBefore") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { q, countries, format, beginnerFriendly, travelReimbursement, startsAfter, startsBefore, limit } = parsed.data;
  const user = await getCurrentUserRecord();

  const rows = await db
    .select({
      id: hackathons.id,
      name: hackathons.name,
      slug: hackathons.slug,
      shortDescription: hackathons.shortDescription,
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
      searchScore: q ? sql<number>`similarity(${hackathons.name}, ${q})` : sql<number>`0`,
    })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(
      and(
        isNotNull(hackathons.publishedAt),
        inArray(hackathons.status, publicStatuses),
        q ? ilike(hackathons.name, `%${q}%`) : undefined,
        countries.length ? inArray(hackathonLocations.country, countries) : undefined,
        format ? eq(hackathons.format, format) : undefined,
        beginnerFriendly === undefined ? undefined : eq(hackathons.beginnerFriendly, beginnerFriendly),
        travelReimbursement === undefined ? undefined : eq(hackathons.travelReimbursement, travelReimbursement),
        startsAfter ? gte(hackathonDates.startsAt, startsAfter) : undefined,
        startsBefore ? lte(hackathonDates.startsAt, startsBefore) : undefined
      )
    )
    .orderBy(q ? sql`similarity(${hackathons.name}, ${q}) desc` : asc(hackathonDates.startsAt))
    .limit(limit);

  const hackathonIds = rows.map((row) => row.id);
  const [savedRows, voteRows] =
    user && hackathonIds.length
      ? await Promise.all([
          db
            .select({
              hackathonId: userHackathons.hackathonId,
              isSaved: userHackathons.isSaved,
            })
            .from(userHackathons)
            .where(and(eq(userHackathons.userId, user.id), inArray(userHackathons.hackathonId, hackathonIds))),
          db
            .select({
              hackathonId: userHackathonVotes.hackathonId,
              vote: userHackathonVotes.vote,
            })
            .from(userHackathonVotes)
            .where(and(eq(userHackathonVotes.userId, user.id), inArray(userHackathonVotes.hackathonId, hackathonIds))),
        ])
      : [[], []];

  const savedByHackathon = new Map(savedRows.map((row) => [row.hackathonId, row.isSaved]));
  const voteByHackathon = new Map(voteRows.map((row) => [row.hackathonId, row.vote]));

  return NextResponse.json({
    data: rows.map((row) => ({
      badges: buildBadges(row),
      date: formatDateRange(row.startsAt, row.endsAt),
      description: row.shortDescription ?? "Event details are being verified by the Hackathons North America team.",
      duration: formatDuration(row.startsAt, row.endsAt, row.format),
      id: row.id,
      image: row.imageUrl,
      isSaved: savedByHackathon.get(row.id) ?? false,
      location: formatLocation(row),
      name: row.name,
      userVote: (voteByHackathon.get(row.id) ?? 0) as -1 | 0 | 1,
      voteScore: row.voteScore,
    })),
  });
}
