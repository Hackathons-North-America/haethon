import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { BadgeCheck, CalendarDays, MapPin, Trophy } from "lucide-react";

import { AccountSignOutButton } from "@/components/account-sign-out-button";
import { AccountProfileForm } from "@/components/forms/account-profile-form";
import { HackathonCheckinForm } from "@/components/hackathon-checkin-form";
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
import { dateToInputValue } from "@/lib/hackathons/utils";

function startOfWeek(date: Date) {
  const value = new Date(date);
  const day = value.getDay();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - day);
  return value;
}

function activityWeeks(attendance: { attendedOn: Date }[]) {
  const today = new Date();
  const weeks = [];
  const attendanceByWeek = new Map<string, number>();

  for (const row of attendance) {
    const key = dateToInputValue(startOfWeek(row.attendedOn));
    attendanceByWeek.set(key, (attendanceByWeek.get(key) ?? 0) + 1);
  }

  for (let index = 51; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index * 7);
    const weekStart = startOfWeek(date);
    const key = dateToInputValue(weekStart);
    const count = attendanceByWeek.get(key) ?? 0;
    weeks.push({ key, count });
  }

  return weeks;
}

function formatChartDate(value: string | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
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

  const [[profile], savedHackathons, wins, attendance, attendedHackathons] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, context.user.id)).limit(1),
    db
      .select({
        id: userHackathons.id,
        hackathonId: hackathons.id,
        applicationStatus: userHackathons.applicationStatus,
        hackathonName: hackathons.name,
        city: hackathonLocations.city,
        region: hackathonLocations.region,
        country: hackathonLocations.country,
        startsAt: hackathonDates.startsAt,
        endsAt: hackathonDates.endsAt,
      })
      .from(userHackathons)
      .innerJoin(hackathons, eq(hackathons.id, userHackathons.hackathonId))
      .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .where(and(eq(userHackathons.userId, context.user.id), eq(userHackathons.isSaved, true)))
      .orderBy(desc(userHackathons.updatedAt))
      .limit(8),
    db
      .select({
        id: hackathonResults.id,
        placement: hackathonResults.placement,
        awardName: hackathonResults.awardName,
        createdAt: hackathonResults.createdAt,
        hackathonName: hackathons.name,
      })
      .from(hackathonResults)
      .innerJoin(hackathons, eq(hackathons.id, hackathonResults.hackathonId))
      .where(
        and(
          eq(hackathonResults.userId, context.user.id),
          or(isNotNull(hackathonResults.placement), isNotNull(hackathonResults.awardName))
        )
      )
      .orderBy(desc(hackathonResults.createdAt))
      .limit(8),
    db
      .select({ attendedOn: userHackathonAttendanceDays.attendedOn })
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
  ]);
  const weeks = activityWeeks(attendance);
  const yearAttendanceCount = weeks.reduce((total, week) => total + week.count, 0);
  const chartLabels = [
    { className: "text-left", text: formatChartDate(weeks[0]?.key) },
    { className: "text-center", text: formatChartDate(weeks[Math.floor(weeks.length / 2)]?.key) },
    { className: "text-right", text: formatChartDate(weeks.at(-1)?.key) },
  ];
  const displayName = [context.user.firstName, context.user.lastName].filter(Boolean).join(" ") || context.user.email;
  const pinnedWins = wins.slice(0, 6);

  return (
    <main className="min-h-[calc(100vh-80px)] bg-white px-5 py-8 text-black sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="grid gap-8 lg:grid-cols-[296px_minmax(0,1fr)]">
          <aside id="profile" className="lg:sticky lg:top-24 lg:self-start">
            <AccountProfileForm displayEmail={context.user.email} displayName={displayName} profile={profile ?? null} />
            <Link
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-[#660000] bg-white px-4 text-sm font-semibold text-[#660000] transition hover:bg-[#660000] hover:text-white focus-visible:bg-[#660000] focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]"
              href="/account/settings"
            >
              Account Settings
            </Link>
            <div className="mt-3">
              <AccountSignOutButton />
            </div>
          </aside>

          <div className="min-w-0 space-y-6">
            <section className="rounded-lg bg-[#F7F7F4] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={sectionHeadingClassName}>Pinned</h2>
                <p className="text-sm text-[#706F6B]">Verified wins</p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {pinnedWins.length ? (
                  pinnedWins.map((win) => (
                    <article className="min-h-28 rounded-lg border border-black/10 bg-white p-4" key={win.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <Trophy aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#660000]" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-black">{win.hackathonName}</p>
                            <p className="mt-2 text-sm text-[#706F6B]">{win.awardName ?? win.placement}</p>
                          </div>
                        </div>
                        <span className="rounded-full border border-black/10 px-2 py-0.5 text-xs font-semibold text-[#706F6B]">
                          Won
                        </span>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-[#706F6B]">Verified results from organizers and admins will appear here.</p>
                )}
              </div>
            </section>

            <section id="activity" className="rounded-lg bg-[#F7F7F4] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={sectionHeadingClassName}>Activity</h2>
                <div className="rounded-lg border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-black">
                  {yearAttendanceCount} attended days
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold text-black">{yearAttendanceCount} hackathon attendance entries in the last year</p>
              <div className="mt-3 overflow-x-auto rounded-lg border border-black/10 bg-white p-4">
                <div className="grid min-w-[624px] grid-cols-[repeat(52,minmax(0,1fr))] gap-1">
                  {weeks.map((week) => (
                    <div
                      className={`h-8 rounded-[4px] ${
                        week.count > 2 ? "bg-[#660000]" : week.count > 0 ? "bg-[#B55A5A]" : "bg-black/10"
                      }`}
                      key={week.key}
                      title={`Week of ${week.key}: ${week.count} attended hackathon day${week.count === 1 ? "" : "s"}`}
                    />
                  ))}
                </div>
                <div className="mt-2 grid min-w-[624px] grid-cols-3 text-xs text-[#706F6B]">
                  {chartLabels.map((label) => (
                    <span className={label.className} key={label.className}>
                      {label.text}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-end gap-2 text-xs text-[#706F6B]">
                  <span>Less</span>
                  <span className="size-3 rounded-[3px] bg-black/10" />
                  <span className="size-3 rounded-[3px] bg-[#B55A5A]" />
                  <span className="size-3 rounded-[3px] bg-[#660000]" />
                  <span>More</span>
                </div>
              </div>
            </section>

            <div className="space-y-6">
              <section className="rounded-lg border border-black/10 bg-[#F7F7F4] p-5">
                <h2 className={sectionHeadingClassName}>Hackathons attended</h2>
                <div className="mt-4 space-y-3">
                  {attendedHackathons.length ? (
                    attendedHackathons.map((hackathon) => {
                      const tier = deriveAttendanceTrustTier(hackathon.sources ?? []);

                      return (
                        <article className="rounded-lg border border-black/10 bg-white p-4" key={hackathon.id}>
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
                </div>
              </section>

              <section id="saved" className="rounded-lg border border-black/10 bg-[#F7F7F4] p-5">
                <h2 className={sectionHeadingClassName}>Saved hackathons</h2>
                <div className="mt-4 space-y-3">
                  {savedHackathons.length ? (
                    savedHackathons.map((hackathon) => (
                      <article className="rounded-lg border border-black/10 bg-white p-4" key={hackathon.id}>
                        <p className="font-semibold text-black">{hackathon.hackathonName}</p>
                        <p className="mt-1 text-sm text-[#706F6B]">
                          {[hackathon.city, hackathon.region, hackathon.country].filter(Boolean).join(", ")} ·{" "}
                          {dateToInputValue(hackathon.startsAt)}
                        </p>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#660000]">
                          {hackathon.applicationStatus}
                        </p>
                        <HackathonCheckinForm hackathonId={hackathon.hackathonId} />
                      </article>
                    ))
                  ) : (
                    <p className="text-sm text-[#706F6B]">Saved hackathons will appear here.</p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
