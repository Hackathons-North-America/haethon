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

export type ProfilePageData = {
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

/**
 * Builds the hackathon-history half of a profile (pinned, activity, attended).
 *
 * Shared by the owner's /account page and the public share page, so both
 * render identical data and there is only one place where the query shape —
 * and therefore what a visitor can see — is defined.
 */
export async function loadProfilePageData(userId: string): Promise<ProfilePageData> {
  const [winRows, pinnedSelfReported, attendanceRows] = await Promise.all([
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
      .leftJoin(userHackathons, and(eq(userHackathons.hackathonId, hackathons.id), eq(userHackathons.userId, userId)))
      .where(
        and(
          eq(hackathonResults.userId, userId),
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

  const yearActivity = buildYearActivity(attendance, winDatesByYear, years);

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

  return { pinnedItems, yearActivity, latestAttended, attendedRows };
}
