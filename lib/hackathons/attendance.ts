import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonDates, userHackathonAttendanceDays } from "@/lib/db/schema";
import { enumerateAttendanceDays, statusShouldInferAttendance } from "@/lib/hackathons/utils";

export async function syncInferredAttendanceDays(input: {
  userId: string;
  hackathonId: string;
  applicationStatus: string | undefined;
}) {
  await db
    .delete(userHackathonAttendanceDays)
    .where(
      and(
        eq(userHackathonAttendanceDays.userId, input.userId),
        eq(userHackathonAttendanceDays.hackathonId, input.hackathonId),
        eq(userHackathonAttendanceDays.source, "inferred")
      )
    );

  if (!statusShouldInferAttendance(input.applicationStatus)) {
    return [];
  }

  const [dates] = await db.select().from(hackathonDates).where(eq(hackathonDates.hackathonId, input.hackathonId)).limit(1);

  if (!dates) {
    return [];
  }

  const attendedDays = enumerateAttendanceDays(dates.startsAt, dates.endsAt);

  if (!attendedDays.length) {
    return [];
  }

  await db
    .insert(userHackathonAttendanceDays)
    .values(
      attendedDays.map((attendedOn) => ({
        userId: input.userId,
        hackathonId: input.hackathonId,
        attendedOn,
        source: "inferred" as const,
      }))
    )
    .onConflictDoNothing();

  return attendedDays;
}
