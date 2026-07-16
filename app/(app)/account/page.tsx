import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import { CalendarDays, Trophy } from "lucide-react";

import { AttendedHackathonsTable, type AttendedHackathonRow } from "@/components/attended-hackathons-table";
import { AccountProfileForm } from "@/components/forms/account-profile-form";
import { EmailPreferencesToggle } from "@/components/email-preferences-toggle";
import { ProfileActivity, type LatestAttended, type YearActivity } from "@/components/profile-activity";
import { getCurrentUserContext, syncCurrentUser } from "@/lib/auth";
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

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

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

const sectionTitleClassName = "font-serif text-4xl font-semibold tracking-[-0.035em] text-navy dark:text-wheat sm:text-5xl";

export default async function AccountPage() {
  // Most pages skip the Clerk profile sync for speed; the account page is
  // where profile data is shown/edited, so refresh it here explicitly.
  await syncCurrentUser();

  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/sign-in");
  }

  const [[profile], winRows, pinnedSelfReported, attendanceRows] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, context.user.id)).limit(1),
    db
      .select({
        id: hackathonResults.id,
        hackathonId: hackathons.id,
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
      .orderBy(desc(hackathonResults.createdAt)),
    db
      .select({
        id: userHackathons.id,
        hackathonId: hackathons.id,
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
        hackathonName: hackathons.name,
        city: hackathonLocations.city,
        region: hackathonLocations.region,
        country: hackathonLocations.country,
        startsAt: hackathonDates.startsAt,
        source: userHackathonAttendanceDays.source,
      })
      .from(userHackathonAttendanceDays)
      .innerJoin(hackathons, eq(hackathons.id, userHackathonAttendanceDays.hackathonId))
      .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .where(eq(userHackathonAttendanceDays.userId, context.user.id))
      .orderBy(desc(userHackathonAttendanceDays.attendedOn)),
  ]);
  const wins = winRows.slice(0, 8);
  const attendance = attendanceRows.map(({ hackathonId, attendedOn }) => ({ hackathonId, attendedOn }));
  const attendedByHackathon = new Map<
    string,
    {
      id: string;
      hackathonName: string;
      city: string | null;
      region: string | null;
      country: string | null;
      startsAt: Date | null;
      attendedDays: number;
      sources: AttendanceSource[];
    }
  >();

  for (const row of attendanceRows) {
    const existing = attendedByHackathon.get(row.hackathonId);

    if (existing) {
      existing.attendedDays += 1;
      existing.sources.push(row.source);
      continue;
    }

    attendedByHackathon.set(row.hackathonId, {
      id: row.hackathonId,
      hackathonName: row.hackathonName,
      city: row.city,
      region: row.region,
      country: row.country,
      startsAt: row.startsAt,
      attendedDays: 1,
      sources: [row.source],
    });
  }

  const attendedHackathons = [...attendedByHackathon.values()].slice(0, 8);
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const winDatesByYear = new Map<number, number>();
  const seenWinIds = new Set<string>();
  for (const win of winRows) {
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

  // Rows for the Notion-style attended table. A hackathon is a "Winner" when the
  // user has a recorded win for it, taking visual priority over the trust tier.
  const wonHackathonIds = new Set(winRows.map((win) => win.hackathonId));
  const attendedRows: AttendedHackathonRow[] = attendedHackathons.map((hackathon) => ({
    id: hackathon.id,
    name: hackathon.hackathonName,
    date: hackathon.startsAt ? dateToInputValue(hackathon.startsAt) : null,
    location: [hackathon.city, hackathon.region, hackathon.country].filter(Boolean).join(", ") || "Location TBD",
    tier: deriveAttendanceTrustTier(hackathon.sources ?? []),
    isWinner: wonHackathonIds.has(hackathon.id),
  }));

  const pinnedItems = [
    ...wins.map((win) => ({
      id: `win-${win.id}`,
      hackathonId: win.hackathonId,
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
      hackathonId: row.hackathonId,
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
    <main className="relative min-h-[calc(100vh-80px)] bg-white dark:bg-white/[0.06] px-5 py-8 text-navy dark:text-wheat sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[840px]">
        <div className="space-y-10">
          <section id="profile" className="pt-2">
            <AccountProfileForm
              firstName={context.user.firstName}
              lastName={context.user.lastName}
              profile={profile ?? null}
            />
          </section>

          <section id="email-preferences">
            <EmailPreferencesToggle initialEnabled={!context.user.emailUnsubscribedAt} />
          </section>

          <div className="min-w-0 space-y-10">
            <section className="pb-2 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={sectionTitleClassName}>Pinned</h2>
                <p className="text-sm text-navy/55 dark:text-wheat/55">Wins &amp; attended events you&apos;ve pinned</p>
              </div>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                {pinnedItems.length ? (
                  pinnedItems.map((item) => (
                    <article
                      className={`group flex flex-col overflow-hidden rounded-2xl bg-ivory dark:bg-white/5 ${
                        item.isWin
                          ? "border-2 border-[#D4A72C] shadow-[0_0_0_3px_rgba(212,167,44,0.18)]"
                          : "border border-navy/10 dark:border-white/10"
                      }`}
                      key={item.id}
                    >
                      {/* Big cover image, mirroring the reference listing card. */}
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-white dark:bg-white/[0.06]">
                        {item.imageUrl ? (
                          <Image
                            alt={item.hackathonName}
                            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            fill
                            sizes="(min-width: 768px) 400px, 100vw"
                            src={`/api/hackathons/${encodeURIComponent(item.hackathonId)}/logo`}
                          />
                        ) : (
                          // No cover image: fall back to a hackathon-specific branded tile
                          // (initials over the accent gradient) rather than a generic trophy.
                          <div className="grid size-full place-items-center bg-[radial-gradient(120%_120%_at_30%_20%,rgba(102,0,0,0.12)_0%,rgba(102,0,0,0.04)_55%,transparent_100%)] dark:bg-[radial-gradient(120%_120%_at_30%_20%,rgba(228,163,171,0.16)_0%,rgba(228,163,171,0.05)_55%,transparent_100%)]">
                            <span className="text-4xl font-semibold tracking-tight text-cabernet dark:text-[#e4a3ab]">
                              {getInitials(item.hackathonName) || "HN"}
                            </span>
                          </div>
                        )}
                        {/* Winner ribbon — makes the win unmistakable. */}
                        {item.isWin ? (
                          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#D4A72C] px-3 py-1.5 text-xs font-bold text-[#3a2c05] shadow-[0_4px_14px_rgba(0,0,0,0.25)]">
                            <Trophy aria-hidden="true" className="size-3.5" />
                            Winner
                          </span>
                        ) : null}
                        {/* Provenance chip, kept legible over the image. */}
                        <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                          {item.tier === "verified" ? "Verified" : "Self reported"}
                        </span>
                      </div>

                      {/* Text block below the image. */}
                      <div className="flex flex-1 flex-col p-4">
                        <p className="font-semibold text-navy dark:text-wheat">{item.hackathonName}</p>
                        <p className="mt-1 flex items-center gap-1 text-sm text-navy/55 dark:text-wheat/55">
                          <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                          <span>{formatDateRange(item.startsAt, item.endsAt)}</span>
                        </p>
                        {item.isWin ? (
                          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-[#9a7b1f] dark:text-[#e8c76b]">
                            <Trophy aria-hidden="true" className="size-3.5 shrink-0" />
                            Won · {item.detail}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-sm text-navy/55 dark:text-wheat/55">{item.detail}</p>
                        )}
                        {item.devpostUrl ? (
                          <a
                            className="mt-3 block truncate text-sm font-semibold text-cabernet dark:text-[#e4a3ab] underline decoration-1 underline-offset-4 hover:no-underline"
                            href={item.devpostUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            View on Devpost
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-navy/55 dark:text-wheat/55">
                    Pin wins and attended events from{" "}
                    <Link
                      className="font-semibold text-cabernet dark:text-[#e4a3ab] underline decoration-1 underline-offset-4 hover:no-underline"
                      href="/my"
                    >
                      My hackathons
                    </Link>{" "}
                    to feature them here.
                  </p>
                )}
              </div>
            </section>

            <ProfileActivity latestAttended={latestAttended} years={yearActivity} />

            <section id="hackathons-attended" className="pb-2 pt-5">
              <h2 className={sectionTitleClassName}>Hackathons attended</h2>
              <div className="mt-4">
                <AttendedHackathonsTable rows={attendedRows} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
