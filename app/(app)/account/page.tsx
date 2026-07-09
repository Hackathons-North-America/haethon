import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { BadgeCheck, CalendarDays, MapPin, Trophy } from "lucide-react";

import { AccountSignOutButton } from "@/components/account-sign-out-button";
import { AccountProfileForm } from "@/components/forms/account-profile-form";
import { HackathonCheckinForm } from "@/components/hackathon-checkin-form";
import { ProfileActivity, type LatestAttended, type YearActivity } from "@/components/profile-activity";
import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hackathonDates,
  hackathonLocations,
  hackathonResults,
  hackathons,
  userHackathonAttendanceDays,
  userHackathons,
  userProfiles,
} from "@/lib/db/schema";
import { deriveAttendanceTrustTier, type AttendanceSource, type AttendanceTrustTier } from "@/lib/hackathons/attendance-rules";
import { formatDateRange } from "@/lib/hackathons/card-format";
import { dateToInputValue } from "@/lib/hackathons/utils";

function startOfWeek(date: Date) {
  const value = new Date(date);
  const day = value.getDay();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - day);
  return value;
}

function activityWeeksForYear(attendance: { attendedOn: Date }[], year: number) {
  const attendanceByWeek = new Map<string, number>();

  for (const row of attendance) {
    if (row.attendedOn.getFullYear() !== year) {
      continue;
    }
    const key = dateToInputValue(startOfWeek(row.attendedOn));
    attendanceByWeek.set(key, (attendanceByWeek.get(key) ?? 0) + 1);
  }

  const weeks = [];
  const lastDay = new Date(year, 11, 31);
  const cursor = startOfWeek(new Date(year, 0, 1));

  while (cursor <= lastDay) {
    const key = dateToInputValue(cursor);
    weeks.push({ key, count: attendanceByWeek.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 7);
  }

  return weeks;
}

function buildYearActivity(
  attendance: { hackathonId: string; attendedOn: Date }[],
  winDatesByYear: Map<number, number>,
  years: number[]
): YearActivity[] {
  return years.map((year) => {
    const yearAttendance = attendance.filter((row) => row.attendedOn.getFullYear() === year);

    return {
      year,
      weeks: activityWeeksForYear(yearAttendance, year),
      totalDays: yearAttendance.length,
      hackathonsAttended: new Set(yearAttendance.map((row) => row.hackathonId)).size,
      wins: winDatesByYear.get(year) ?? 0,
    };
  });
}

function formatLatestDate(value: Date | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(value);
}

const sectionHeadingClassName = "text-sm font-semibold uppercase tracking-[0.2em] text-[#660000]";

function AttendanceTierBadge({ tier }: { tier: AttendanceTrustTier | null }) {
  if (tier === "verified") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#660000]/25 bg-[#660000]/5 px-2 py-0.5 text-xs font-semibold text-[#660000]">
        <BadgeCheck aria-hidden="true" className="size-3.5" />
        Verified
      </span>
    );
  }

  if (tier === "self_reported") {
    return (
      <span className="shrink-0 rounded-full border border-black/10 px-2 py-0.5 text-xs font-semibold text-[#706F6B]">
        Self-reported
      </span>
    );
  }

  return null;
}

export default async function AccountPage() {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/sign-in");
  }

  const [[profile], wins, pinnedSelfReported, attendance, attendedHackathons, winDates] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, context.user.id)).limit(1),
    db
      .select({
        id: hackathonResults.id,
        placement: hackathonResults.placement,
        awardName: hackathonResults.awardName,
        createdAt: hackathonResults.createdAt,
        hackathonName: hackathons.name,
        imageUrl: hackathons.imageUrl,
        startsAt: hackathonDates.startsAt,
        endsAt: hackathonDates.endsAt,
        devpostUrl: userHackathons.devpostUrl,
      })
      .from(hackathonResults)
      .innerJoin(hackathons, eq(hackathons.id, hackathonResults.hackathonId))
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .leftJoin(
        userHackathons,
        and(eq(userHackathons.hackathonId, hackathons.id), eq(userHackathons.userId, context.user.id))
      )
      .where(
        and(
          eq(hackathonResults.userId, context.user.id),
          or(isNotNull(hackathonResults.placement), isNotNull(hackathonResults.awardName))
        )
      )
      .orderBy(desc(hackathonResults.createdAt))
      .limit(8),
    db
      .select({
        id: userHackathons.id,
        applicationStatus: userHackathons.applicationStatus,
        awardName: userHackathons.awardName,
        devpostUrl: userHackathons.devpostUrl,
        updatedAt: userHackathons.updatedAt,
        hackathonName: hackathons.name,
        imageUrl: hackathons.imageUrl,
        startsAt: hackathonDates.startsAt,
        endsAt: hackathonDates.endsAt,
      })
      .from(userHackathons)
      .innerJoin(hackathons, eq(hackathons.id, userHackathons.hackathonId))
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .where(and(eq(userHackathons.userId, context.user.id), eq(userHackathons.isPinned, true)))
      .orderBy(desc(userHackathons.updatedAt))
      .limit(8),
    db
      .select({
        hackathonId: userHackathonAttendanceDays.hackathonId,
        attendedOn: userHackathonAttendanceDays.attendedOn,
      })
      .from(userHackathonAttendanceDays)
      .where(eq(userHackathonAttendanceDays.userId, context.user.id)),
    db
      .select({
        id: hackathons.id,
        hackathonName: hackathons.name,
        city: hackathonLocations.city,
        region: hackathonLocations.region,
        country: hackathonLocations.country,
        startsAt: hackathonDates.startsAt,
        attendedDays: sql<number>`count(${userHackathonAttendanceDays.id})::int`,
        sources: sql<AttendanceSource[]>`array_agg(${userHackathonAttendanceDays.source})::text[]`,
      })
      .from(userHackathonAttendanceDays)
      .innerJoin(hackathons, eq(hackathons.id, userHackathonAttendanceDays.hackathonId))
      .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .where(eq(userHackathonAttendanceDays.userId, context.user.id))
      .groupBy(
        hackathons.id,
        hackathonLocations.city,
        hackathonLocations.region,
        hackathonLocations.country,
        hackathonDates.startsAt
      )
      .orderBy(desc(sql`max(${userHackathonAttendanceDays.attendedOn})`))
      .limit(8),
    db
      .select({
        id: hackathonResults.id,
        startsAt: hackathonDates.startsAt,
        createdAt: hackathonResults.createdAt,
      })
      .from(hackathonResults)
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathonResults.hackathonId))
      .where(
        and(
          eq(hackathonResults.userId, context.user.id),
          or(isNotNull(hackathonResults.placement), isNotNull(hackathonResults.awardName))
        )
      ),
  ]);
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const winDatesByYear = new Map<number, number>();
  const seenWinIds = new Set<string>();
  for (const win of winDates) {
    if (seenWinIds.has(win.id)) {
      continue;
    }
    seenWinIds.add(win.id);
    const winYear = (win.startsAt ?? win.createdAt).getFullYear();
    winDatesByYear.set(winYear, (winDatesByYear.get(winYear) ?? 0) + 1);
  }

  const yearActivity: YearActivity[] = buildYearActivity(attendance, winDatesByYear, years);

  const latestAttendedOn = attendance.reduce<Date | null>(
    (latest, row) => (!latest || row.attendedOn > latest ? row.attendedOn : latest),
    null
  );
  const latestAttended: LatestAttended = attendedHackathons[0]
    ? { name: attendedHackathons[0].hackathonName, dateLabel: formatLatestDate(latestAttendedOn) }
    : null;

  const displayName = [context.user.firstName, context.user.lastName].filter(Boolean).join(" ") || context.user.email;
  const pinnedItems = [
    ...wins.map((win) => ({
      id: `win-${win.id}`,
      hackathonName: win.hackathonName,
      detail: win.awardName ?? win.placement ?? "Verified win",
      tier: "verified" as AttendanceTrustTier,
      isWin: true,
      imageUrl: win.imageUrl,
      startsAt: win.startsAt,
      endsAt: win.endsAt,
      devpostUrl: win.devpostUrl,
    })),
    ...pinnedSelfReported.map((row) => ({
      id: `pin-${row.id}`,
      hackathonName: row.hackathonName,
      detail: row.applicationStatus === "won" ? row.awardName ?? "Winner" : "Attended",
      tier: "self_reported" as AttendanceTrustTier,
      isWin: row.applicationStatus === "won",
      imageUrl: row.imageUrl,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      devpostUrl: row.devpostUrl,
    })),
  ].slice(0, 6);

  return (
    <main className="relative min-h-[calc(100vh-80px)] bg-white px-5 py-8 text-black sm:px-8 lg:px-12">
      <div className="absolute right-5 top-8 sm:right-8 lg:right-12">
        <AccountSignOutButton />
      </div>
      <div className="mx-auto w-full max-w-[720px]">
        <div className="space-y-6">
          <section id="profile" className="pt-2">
            <AccountProfileForm displayEmail={context.user.email} displayName={displayName} profile={profile ?? null} />
          </section>

          <div className="min-w-0 space-y-6">
            <section className="rounded-lg bg-[#F7F7F4] px-5 py-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={sectionHeadingClassName}>Pinned</h2>
                <p className="text-sm text-[#706F6B]">Wins &amp; attended events you&apos;ve pinned</p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {pinnedItems.length ? (
                  pinnedItems.map((item) => (
                    <article
                      className={`min-h-28 rounded-lg bg-white p-4 ${
                        item.isWin
                          ? "border-2 border-[#D4A72C] shadow-[0_0_0_3px_rgba(212,167,44,0.18)]"
                          : "border-2 border-transparent"
                      }`}
                      key={item.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#F7F7F4]">
                            {item.imageUrl ? (
                              <Image
                                alt={`${item.hackathonName} logo`}
                                className="object-contain"
                                fill
                                sizes="48px"
                                src={item.imageUrl}
                                unoptimized
                              />
                            ) : (
                              <Trophy aria-hidden="true" className="size-5 text-[#660000]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-black">{item.hackathonName}</p>
                            <p className="mt-1 flex items-center gap-1 text-sm text-[#706F6B]">
                              <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                              <span>{formatDateRange(item.startsAt, item.endsAt)}</span>
                            </p>
                            <p className="mt-1 text-sm text-[#706F6B]">{item.detail}</p>
                          </div>
                        </div>
                        <AttendanceTierBadge tier={item.tier} />
                      </div>
                      {item.devpostUrl ? (
                        <div className="mt-3 border-t border-black/10 pt-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#706F6B]">Devpost link</p>
                          <a
                            className="mt-1 block truncate text-sm font-semibold text-[#660000] underline decoration-1 underline-offset-4 hover:no-underline"
                            href={item.devpostUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {item.devpostUrl.replace(/^https?:\/\//, "")}
                          </a>
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-[#706F6B]">
                    Pin wins and attended events from{" "}
                    <Link
                      className="font-semibold text-[#660000] underline decoration-1 underline-offset-4 hover:no-underline"
                      href="/my"
                    >
                      My hackathons
                    </Link>{" "}
                    to feature them here.
                  </p>
                )}
              </div>
            </section>

            <ProfileActivity latestAttended={latestAttended} years={yearActivity}>
              {attendedHackathons.length ? (
                attendedHackathons.map((hackathon) => {
                  const tier = deriveAttendanceTrustTier(hackathon.sources ?? []);

                  return (
                    <article className="rounded-lg bg-white p-4" key={hackathon.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#660000]" />
                          <div className="min-w-0">
                            <p className="font-semibold text-black">{hackathon.hackathonName}</p>
                            <p className="mt-1 text-sm text-[#706F6B]">
                              {hackathon.attendedDays} attended day{hackathon.attendedDays === 1 ? "" : "s"}
                              {hackathon.startsAt ? ` · ${dateToInputValue(hackathon.startsAt)}` : ""}
                            </p>
                            <p className="mt-1 flex items-center gap-1 text-sm text-[#706F6B]">
                              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                              <span>{[hackathon.city, hackathon.region, hackathon.country].filter(Boolean).join(", ") || "Location TBD"}</span>
                            </p>
                          </div>
                        </div>
                        <AttendanceTierBadge tier={tier} />
                      </div>
                      {tier !== "verified" ? <HackathonCheckinForm hackathonId={hackathon.id} /> : null}
                    </article>
                  );
                })
              ) : (
                <p className="text-sm text-[#706F6B]">Hackathons attended will appear here.</p>
              )}
            </ProfileActivity>
          </div>
        </div>
      </div>
    </main>
  );
}
