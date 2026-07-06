import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { detectAttendanceAnomalies } from "@/lib/hackathons/attendance-anomaly-service";

export async function GET() {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const findings = await detectAttendanceAnomalies();

  return NextResponse.json({ data: findings });
}
