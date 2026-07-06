import { NextResponse } from "next/server";

import { getCurrentUserContext, isOrganizerRole } from "@/lib/auth";
import { canManageHackathon, listHackathonAttendees } from "@/lib/hackathons/checkin-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  if (!isOrganizerRole(userContext.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  if (!(await canManageHackathon({ userId: userContext.user.id, role: userContext.role, hackathonId: id }))) {
    return NextResponse.json({ error: "You don't organize this hackathon." }, { status: 403 });
  }

  const attendees = await listHackathonAttendees(id);

  return NextResponse.json({ data: attendees });
}
