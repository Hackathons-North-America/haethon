import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, ilike, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { AdminNavLink } from "@/components/admin-nav-link";
import { HackathonSearch } from "@/components/hackathon-search";
import type { HackathonCardData } from "@/components/hackathon-card";
import { NavAuthLink } from "@/components/nav-auth-link";
import { getCurrentUserRecord } from "@/lib/auth";
import { db } from "@/lib/db";
import { hackathonDates, hackathonLocations, hackathons, userHackathons, userHackathonVotes } from "@/lib/db/schema";
import { dateRangeForPeriod, normalizeSearchFilters } from "@/lib/hackathons/search-filters";
import type { HackathonSearchFilters } from "@/lib/hackathons/search-filters";

export const metadata: Metadata = {
  title: "Hackathons | Hackathons North America",
  description: "Browse upcoming hackathons across North America.",
};

const navItems = [
  { label: "About", href: "/#about" },
  { label: "FQA", href: "/#fqa" },
  { label: "Submit", href: "/submit" },
  { label: "Hackathons", href: "/hackathons" },
];

const navLinkClassName =
  "decoration-[#660000] decoration-1 underline-offset-6 hover:text-[#660000] hover:underline focus-visible:text-[#660000] focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]";

const loginLinkClassName =
  "inline-flex min-h-9 items-center justify-center border border-[#660000] px-4 text-[#660000] transition-colors hover:bg-[#660000] hover:text-white focus-visible:bg-[#660000] focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]";

const publicStatuses = ["upcoming", "live"] as const;
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

async function getHackathonCards(filters: HackathonSearchFilters): Promise<HackathonCardData[]> {
  const user = await getCurrentUserRecord();
  const dateRange = dateRangeForPeriod(filters.datePeriod);
  const name = filters.name.trim();
  const countries = filters.countries;
  const format = filters.format === "any" ? undefined : filters.format;
  const beginnerFriendly =
    filters.beginnerFriendly === "any" ? undefined : filters.beginnerFriendly === "on";
  const travelReimbursement =
    filters.travelReimbursement === "any" ? undefined : filters.travelReimbursement === "on";

  const rows = await db
    .select({
      id: hackathons.id,
      name: hackathons.name,
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
    })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(
      and(
        isNotNull(hackathons.publishedAt),
        inArray(hackathons.status, publicStatuses),
        name ? ilike(hackathons.name, `%${name}%`) : undefined,
        countries.length ? inArray(hackathonLocations.country, countries) : undefined,
        format ? eq(hackathons.format, format) : undefined,
        beginnerFriendly === undefined ? undefined : eq(hackathons.beginnerFriendly, beginnerFriendly),
        travelReimbursement === undefined ? undefined : eq(hackathons.travelReimbursement, travelReimbursement),
        dateRange ? gte(hackathonDates.startsAt, dateRange.startsAfter) : undefined,
        dateRange ? lte(hackathonDates.startsAt, dateRange.startsBefore) : undefined
      )
    )
    .orderBy(name ? sql`similarity(${hackathons.name}, ${name}) desc` : asc(hackathonDates.startsAt))
    .limit(48);

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

  return rows.map((row) => ({
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
  }));
}

export default async function HackathonsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = normalizeSearchFilters((await searchParams) ?? {});
  const hackathonCards = await getHackathonCards(filters);

  return (
    <main className="min-h-screen bg-white text-black">
      <header className="sticky top-0 z-40 bg-white">
        <nav
          aria-label="Primary navigation"
          className="border-b border-black/10 bg-white px-8 font-mono text-xs font-medium uppercase tracking-[0.14em] text-[#706F6B] sm:px-14 lg:px-20"
        >
          <div className="mx-auto flex min-h-20 max-w-[1120px] flex-col items-start justify-center gap-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-0">
            <Link
              className={`${navLinkClassName} font-serif text-xl font-semibold normal-case leading-none tracking-normal text-black sm:text-2xl`}
              href="/"
            >
              Hackathons North America
            </Link>

            <div className="flex flex-wrap items-center justify-start gap-x-5 gap-y-3 sm:justify-end sm:gap-x-8">
              {navItems.map((item) => (
                <Link
                  aria-current={item.href === "/hackathons" ? "page" : undefined}
                  className={`${navLinkClassName} ${
                    item.href === "/hackathons" ? "text-[#660000] underline" : ""
                  }`}
                  href={item.href}
                  key={item.label}
                >
                  {item.label}
                </Link>
              ))}
              <AdminNavLink className={navLinkClassName} />
              <NavAuthLink className={loginLinkClassName} />
            </div>
          </div>
        </nav>
      </header>

      <HackathonSearch initialFilters={filters} initialHackathons={hackathonCards} />
    </main>
  );
}
