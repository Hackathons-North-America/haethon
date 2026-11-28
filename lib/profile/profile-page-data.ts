import { and, desc, eq, isNotNull, or } from "drizzle-orm";

import type { AttendedHackathonRow } from "@/components/attended-hackathons-table";
import type { LatestAttended, YearActivity } from "@/components/profile-activity";
import { db } from "@/lib/db";
import {
  hackathonDates,
  hackathonLocations,
  hackathonResults,
  hackathons,
  userHackathonAttendanceDays,
  userHackathons,
} from "@/lib/db/schema";
import { deriveAttendanceTrustTier, type AttendanceSource, type AttendanceTrustTier } from "@/lib/hackathons/attendance-rules";
import { dateToInputValue } from "@/lib/hackathons/utils";

export type PinnedProfileItem = {
  id: string;
  hackathonId: string;
  hackathonName: string;
  detail: string;
  tier: AttendanceTrustTier;
  isWin: boolean;
  imageUrl: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  devpostUrl: string | null;
};

/** All-time counts. yearActivity only spans the last three years and
    attendedRows is capped, so neither can stand in for these. */
export type ProfileTotals = {
  /** Distinct hackathons with a recorded attendance day or a win. */
  hackathonsAttended: number;
  /**
   * Distinct hackathons won: a result with a placement or award, or a
   * tracked hackathon marked "won". Same rule as the pinned Winner badge.
   */
  wins: number;
  /** Distinct calendar days with attendance, across all hackathons. */
  daysHacked: number;
};

export type ProfilePageData = {
  totals: ProfileTotals;
  pinnedItems: PinnedProfileItem[];
  yearActivity: YearActivity[];
  latestAttended: LatestAttended;
  attendedRows: AttendedHackathonRow[];
};

function startOfWeek(date: Date) {
  const value = new Date(date);
  const day = value.getDay();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - day);
  return value;
}

/** Calendar days, so two hackathons on the same day count once. */
function distinctDays(attendance: { attendedOn: Date }[]) {
  const days = new Map<string, Date>();

  for (const row of attendance) {
    days.set(dateToInputValue(row.attendedOn), row.attendedOn);
  }

  return [...days.values()];
}

/**
 * One cell per week touching the calendar year (the first week can start in
 * late December of the year before), counting distinct days hacked.
 */
function activityWeeksForYear(days: Date[], year: number) {
  const attendanceByWeek = new Map<string, number>();

  for (const day of days) {
    if (day.getFullYear() !== year) {
      continue;
    }
    const key = dateToInputValue(startOfWeek(day));
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
  wonHackathons: Map<string, { year: number }>,
  years: number[]
): YearActivity[] {
  return years.map((year) => {
    const yearAttendance = attendance.filter((row) => row.attendedOn.getFullYear() === year);
    const yearDays = distinctDays(yearAttendance);
    const yearWins = [...wonHackathons].filter(([, win]) => win.year === year).map(([hackathonId]) => hackathonId);

    // Same rules as the all-time totals, scoped to one year.
    return {
      year,
      weeks: activityWeeksForYear(yearDays, year),
      totalDays: yearDays.length,
      hackathonsAttended: new Set([...yearAttendance.map((row) => row.hackathonId), ...yearWins]).size,
      wins: yearWins.length,
    };
  });
}

/** "San Francisco, California"; the country only when nothing finer is known. */
function formatRowLocation(location: { city: string | null; region: string | null; country: string | null }) {
  return [location.city, location.region].filter(Boolean).join(", ") || location.country || "Location TBD";
}

function formatLatestDate(value: Date | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(value);
}

/**
 * Builds the hackathon-history half of a profile (pinned, activity, attended).
 *
 * Shared by the owner's /account page and the public share page, so both
 * render identical data and there is only one place where the query shape —
 * and therefore what a visitor can see — is defined.
 */
export async function loadProfilePageData(userId: string): Promise<ProfilePageData> {
  const [winRows, statusWinRows, pinnedSelfReported, attendanceRows] = await Promise.all([
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
        city: hackathonLocations.city,
        region: hackathonLocations.region,
        country: hackathonLocations.country,
      })
      .from(hackathonResults)
      .innerJoin(hackathons, eq(hackathons.id, hackathonResults.hackathonId))
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
      .leftJoin(userHackathons, and(eq(userHackathons.hackathonId, hackathons.id), eq(userHackathons.userId, userId)))
      .where(
        and(
          eq(hackathonResults.userId, userId),
          or(isNotNull(hackathonResults.placement), isNotNull(hackathonResults.awardName))
        )
      )
      .orderBy(desc(hackathonResults.createdAt)),
    // Tracked hackathons the user marked "won": the other half of the Winner
    // rule (pinned ones show as Winner cards below).
    db
      .select({
        hackathonId: hackathons.id,
        updatedAt: userHackathons.updatedAt,
        hackathonName: hackathons.name,
        startsAt: hackathonDates.startsAt,
        city: hackathonLocations.city,
        region: hackathonLocations.region,
        country: hackathonLocations.country,
      })
      .from(userHackathons)
      .innerJoin(hackathons, eq(hackathons.id, userHackathons.hackathonId))
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .leftJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
      .where(and(eq(userHackathons.userId, userId), eq(userHackathons.applicationStatus, "won"))),
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
      .where(and(eq(userHackathons.userId, userId), eq(userHackathons.isPinned, true)))
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
      .where(eq(userHackathonAttendanceDays.userId, userId))
      .orderBy(desc(userHackathonAttendanceDays.attendedOn)),
  ]);

  const wins = winRows.slice(0, 8);
  const attendance = attendanceRows.map(({ hackathonId, attendedOn }) => ({ hackathonId, attendedOn }));

  type HistoryEntry = {
    id: string;
    hackathonName: string;
    city: string | null;
    region: string | null;
    country: string | null;
    startsAt: Date | null;
    /** Latest attendance day, else the hackathon's start; orders the table. */
    sortDate: Date;
    sources: AttendanceSource[];
  };

  // Every hackathon on the profile, attended or won. Attendance rows arrive
  // newest day first, so the first row per hackathon carries its latest day.
  const history = new Map<string, HistoryEntry>();

  for (const row of attendanceRows) {
    const existing = history.get(row.hackathonId);

    if (existing) {
      existing.sources.push(row.source);
      continue;
    }

    history.set(row.hackathonId, {
      id: row.hackathonId,
      hackathonName: row.hackathonName,
      city: row.city,
      region: row.region,
      country: row.country,
      startsAt: row.startsAt,
      sortDate: row.attendedOn,
      sources: [row.source],
    });
  }

  // Taken before wins join the map, so it is always an attended hackathon.
  const latestAttendedHackathon = history.values().next().value;

  // A hackathon counts as won once, however many awards it recorded. The
  // year is the event's, falling back to when the win was recorded.
  const wonHackathons = new Map<string, { year: number }>();
  const winSources = [
    ...winRows.map((win) => ({ ...win, recordedAt: win.createdAt })),
    ...statusWinRows.map((win) => ({ ...win, recordedAt: win.updatedAt })),
  ];

  for (const win of winSources) {
    if (!wonHackathons.has(win.hackathonId)) {
      wonHackathons.set(win.hackathonId, { year: (win.startsAt ?? win.recordedAt).getFullYear() });
    }

    // Wins without attendance days still belong in Hackathons attended.
    if (!history.has(win.hackathonId)) {
      history.set(win.hackathonId, {
        id: win.hackathonId,
        hackathonName: win.hackathonName,
        city: win.city,
        region: win.region,
        country: win.country,
        startsAt: win.startsAt,
        sortDate: win.startsAt ?? win.recordedAt,
        sources: [],
      });
    }
  }

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const yearActivity = buildYearActivity(attendance, wonHackathons, years);

  const totals: ProfileTotals = {
    hackathonsAttended: history.size,
    wins: wonHackathons.size,
    daysHacked: distinctDays(attendance).length,
  };

  const latestAttended: LatestAttended = latestAttendedHackathon
    ? { name: latestAttendedHackathon.hackathonName, dateLabel: formatLatestDate(latestAttendedHackathon.sortDate) }
      : null;

  // Rows for the Notion-style attended table, newest first. A hackathon is a
  // "Winner" by the same rule as the wins total, taking visual priority over
  // the trust tier.
  const attendedRows: AttendedHackathonRow[] = [...history.values()]
    .sort((first, second) => second.sortDate.getTime() - first.sortDate.getTime())
    .slice(0, 8)
    .map((hackathon) => ({
      id: hackathon.id,
      name: hackathon.hackathonName,
      date: hackathon.startsAt ? dateToInputValue(hackathon.startsAt) : null,
      location: formatRowLocation(hackathon),
      tier: deriveAttendanceTrustTier(hackathon.sources),
      isWinner: wonHackathons.has(hackathon.id),
    }));

  const pinnedItems: PinnedProfileItem[] = [
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

  return { totals, pinnedItems, yearActivity, latestAttended, attendedRows };
}
