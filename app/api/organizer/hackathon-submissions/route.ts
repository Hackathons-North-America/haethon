import { NextResponse } from "next/server";

import { getCurrentIdentity, isOrganizerRole } from "@/lib/auth";
import { getApprovedOrganizationIdsForUser, listHackathonSubmissions } from "@/lib/hackathons/review-service";

export async function GET() {
  const context = await getCurrentIdentity();

  if (!context) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  if (!isOrganizerRole(context.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const organizationIds = await getApprovedOrganizationIdsForUser(context.userId);
  const rows = await listHackathonSubmissions({ allowedOrganizationIds: organizationIds, limit: 100 });

  return NextResponse.json({ data: rows });
}
