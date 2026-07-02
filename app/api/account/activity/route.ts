import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { hackathons, userHackathonAttendanceDays } from "@/lib/db/schema";

export async function GET() {
  const context = await getCurrentUserContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const rows = await db
    .select({
      attendedOn: userHackathonAttendanceDays.attendedOn,
      source: userHackathonAttendanceDays.source,
      hackathonId: userHackathonAttendanceDays.hackathonId,
      hackathonName: hackathons.name,
    })
    .from(userHackathonAttendanceDays)
    .leftJoin(hackathons, eq(hackathons.id, userHackathonAttendanceDays.hackathonId))
    .where(eq(userHackathonAttendanceDays.userId, context.user.id))
    .orderBy(asc(userHackathonAttendanceDays.attendedOn));

  return NextResponse.json({ data: rows });
}
