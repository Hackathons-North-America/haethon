import { NextResponse } from "next/server";

import { getCurrentUserContext, isOrganizerRole } from "@/lib/auth";
import { canManageHackathon, upgradeAttendanceDaysToOrganizerVerified } from "@/lib/hackathons/checkin-service";
import { attendeeVerifySchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  if (!isOrganizerRole(userContext.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = attendeeVerifySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;

  if (!(await canManageHackathon({ userId: userContext.user.id, role: userContext.role, hackathonId: id }))) {
    return NextResponse.json({ error: "You don't organize this hackathon." }, { status: 403 });
  }

  try {
    const upgraded = await upgradeAttendanceDaysToOrganizerVerified({
      userIds: parsed.data.userIds,
      hackathonId: id,
    });

    return NextResponse.json({
      data: {
        verifiedUserIds: [...new Set(upgraded.map((row) => row.userId))],
        upgradedDayCount: upgraded.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify attendees." },
      { status: 500 }
    );
  }
}
