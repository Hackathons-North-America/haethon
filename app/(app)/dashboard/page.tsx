import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, gt, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { AlarmClock, ArrowRight, CalendarDays, MapPin, Radio } from "lucide-react";

import { HackathonCard } from "@/components/hackathon-card";
import type { HackathonCardData } from "@/components/hackathon-card";
import { HackathonCheckinForm } from "@/components/hackathon-checkin-form";
import { getCurrentUserRecord } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hackathonDates,
  hackathonLocations,
  hackathons,
  userHackathons,
  userProfiles,
} from "@/lib/db/schema";
import { buildBadges, formatDateRange, formatDuration, formatLocation } from "@/lib/hackathons/card-format";
import { formatReminderDate } from "@/lib/hackathons/reminder-labels";

export const metadata: Metadata = {
  title: "Dashboard | Hackathons North America",
  description: "What's next for you — upcoming events, deadlines, and hackathons worth a look.",
};

const DAY_MS = 86_400_000;

function countdownLabel(startsAt: Date, now: Date) {
  const days = Math.ceil((startsAt.getTime() - now.getTime()) / DAY_MS);

  if (days <= 0) {
    return "Starts today";
  }

  if (days === 1) {
    return "Starts tomorrow";
  }

  return `Starts in ${days} days`;
}

export default async function DashboardPage() {
  const user = await getCurrentUserRecord();

  if (!user) {
    redirect("/sign-in");
  }

  const now = new Date();
  const [tracked, [profile]] = await Promise.all([
    db
      .select({
        id: userHackathons.id,
        applicationStatus: userHackathons.applicationStatus,
        hackathonId: hackathons.id,
        hackathonName: hackathons.name,
        slug: hackathons.slug,
        venue: hackathons.venue,
        format: hackathons.format,
        city: hackathonLocations.city,
        region: hackathonLocations.region,
        country: hackathonLocations.country,
        startsAt: hackathonDates.startsAt,
        endsAt: hackathonDates.endsAt,
        applicationClosesAt: hackathonDates.applicationClosesAt,
        acceptanceAt: hackathonDates.acceptanceAt,
      })
      .from(userHackathons)
      .innerJoin(hackathons, eq(hackathons.id, userHackathons.hackathonId))
      .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .where(eq(userHackathons.userId, user.id))
      .orderBy(asc(hackathonDates.startsAt)),
    db
      .select({ countryCode: userProfiles.countryCode })
      .from(userProfiles)
      .where(eq(userProfiles.userId, user.id))
      .limit(1),
  ]);

  const confirmed = tracked.filter(
    (row): row is (typeof tracked)[number] & { startsAt: Date; endsAt: Date } =>
      (row.applicationStatus === "attending" || row.applicationStatus === "accepted") &&
      row.startsAt !== null &&
      row.endsAt !== null
  );
  const liveEvent = confirmed.find((row) => row.startsAt <= now && now <= row.endsAt) ?? null;
  const nextEvent = liveEvent ?? confirmed.find((row) => row.startsAt > now) ?? null;

  const closingSoon = tracked.filter(
    (row) =>
      row.applicationStatus === "interested" &&
      row.applicationClosesAt &&
      row.applicationClosesAt > now &&
      row.applicationClosesAt.getTime() - now.getTime() <= 14 * DAY_MS
  );
  const decisionsOut = tracked.filter(
    (row) => row.applicationStatus === "applied" && row.acceptanceAt && row.acceptanceAt <= now
  );
  const unloggedAttendance = tracked.filter(
    (row) => row.applicationStatus === "attending" && row.endsAt && row.endsAt < now
  );

  const trackedIds = tracked.map((row) => row.hackathonId);
  const suggestionOrderBy = profile?.countryCode
    ? [
        sql`case when ${hackathonLocations.countryCode} = ${profile.countryCode} then 0 else 1 end`,
        asc(hackathonDates.startsAt),
      ]
    : [asc(hackathonDates.startsAt)];
  const suggestionRows = await db
    .select({
      id: hackathons.id,
      name: hackathons.name,
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
    })
    .from(hackathons)
    .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(
      and(
        isNotNull(hackathons.publishedAt),
        inArray(hackathons.status, ["upcoming", "live"]),
        gt(hackathonDates.startsAt, now),
        trackedIds.length ? notInArray(hackathons.id, trackedIds) : undefined
      )
    )
    .orderBy(...suggestionOrderBy)
    .limit(3);

  const suggestions: HackathonCardData[] = suggestionRows.map((row) => ({
    badges: buildBadges(row),
    date: formatDateRange(row.startsAt, row.endsAt),
    description: row.shortDescription ?? "Event details are being verified by the Hackathons North America team.",
    duration: formatDuration(row.startsAt, row.endsAt, row.format),
    id: row.id,
    image: row.imageUrl,
    isSaved: false,
    location: formatLocation(row),
    name: row.name,
    slug: row.slug,
    userVote: 0,
    voteScore: row.voteScore,
    websiteUrl: row.websiteUrl,
  }));

  const firstName = user.firstName ?? "hacker";
  const actionCount = closingSoon.length + decisionsOut.length + unloggedAttendance.length;

  return (
    <main className="min-h-screen bg-white px-5 pb-20 pt-14 text-black sm:px-8 sm:pt-16 lg:px-12">
      <div className="mx-auto w-full max-w-[980px]">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-[#660000]">Up next</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-black sm:text-4xl">
          Welcome back, {firstName}.
        </h1>

        <section className="mt-8 rounded-lg border border-black/10 bg-[#F7F7F4] p-6">
          {nextEvent ? (
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.14em] text-[#660000]">
                  {liveEvent ? (
                    <>
                      <Radio aria-hidden="true" className="size-3.5" />
                      Happening now
                    </>
                  ) : (
                    countdownLabel(nextEvent.startsAt, now)
                  )}
                </p>
                <Link
                  className="mt-2 block text-2xl font-semibold text-black underline-offset-4 hover:text-[#660000] hover:underline"
                  href={`/hackathons/${nextEvent.slug}`}
                >
                  {nextEvent.hackathonName}
                </Link>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#706F6B]">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                    {formatDateRange(nextEvent.startsAt, nextEvent.endsAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                    {formatLocation(nextEvent)}
                  </span>
                </p>
                {liveEvent ? (
                  <div className="mt-2">
                    <HackathonCheckinForm hackathonId={liveEvent.hackathonId} />
                  </div>
                ) : null}
              </div>
              <Link
                className="inline-flex min-h-10 items-center gap-1.5 border border-[#660000] px-5 text-sm font-semibold text-[#660000] transition-colors hover:bg-[#660000] hover:text-white"
                href="/my"
              >
                My hackathons
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-black">No confirmed events on your calendar.</p>
                <p className="mt-1 text-sm text-[#706F6B]">
                  Find your next hackathon and we&apos;ll keep track of every deadline from there.
                </p>
              </div>
              <Link
                className="inline-flex min-h-10 items-center gap-1.5 border border-[#660000] px-5 text-sm font-semibold text-[#660000] transition-colors hover:bg-[#660000] hover:text-white"
                href="/hackathons"
              >
                Browse hackathons
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          )}
        </section>

        {actionCount ? (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#660000]">Needs your attention</h2>
            <ul className="mt-4 space-y-2">
              {closingSoon.map((row) => (
                <li key={`close-${row.id}`}>
                  <Link
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-4 transition-colors hover:border-[#660000]/40"
                    href={`/hackathons/${row.slug}`}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-black">
                      <AlarmClock aria-hidden="true" className="size-4 shrink-0 text-[#660000]" />
                      <span className="truncate">{row.hackathonName}</span>
                    </span>
                    <span className="text-sm text-[#706F6B]">
                      Applications close {row.applicationClosesAt ? formatReminderDate(row.applicationClosesAt) : "soon"}
                    </span>
                  </Link>
                </li>
              ))}
              {decisionsOut.map((row) => (
                <li key={`decision-${row.id}`}>
                  <Link
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-4 transition-colors hover:border-[#660000]/40"
                    href={`/hackathons/${row.slug}`}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-black">
                      <AlarmClock aria-hidden="true" className="size-4 shrink-0 text-[#660000]" />
                      <span className="truncate">{row.hackathonName}</span>
                    </span>
                    <span className="text-sm text-[#706F6B]">Decisions should be out — update your status</span>
                  </Link>
                </li>
              ))}
              {unloggedAttendance.map((row) => (
                <li key={`attend-${row.id}`}>
                  <Link
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 p-4 transition-colors hover:border-[#660000]/40"
                    href="/my"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-black">
                      <AlarmClock aria-hidden="true" className="size-4 shrink-0 text-[#660000]" />
                      <span className="truncate">{row.hackathonName}</span>
                    </span>
                    <span className="text-sm text-[#706F6B]">Event ended — mark it attended for your profile</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {suggestions.length ? (
          <section className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#660000]">Worth a look</h2>
              <Link
                className="text-sm font-semibold text-[#660000] underline-offset-4 hover:underline"
                href="/hackathons"
              >
                Browse all
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((hackathon, index) => (
                <HackathonCard hackathon={hackathon} index={index} key={hackathon.id} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
