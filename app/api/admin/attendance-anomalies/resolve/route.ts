import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { resolveAttendanceAnomaly } from "@/lib/hackathons/attendance-anomaly-service";
import { attendanceAnomalyResolveSchema } from "@/lib/validations/hackathon";

export async function POST(request: Request) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const parsed = attendanceAnomalyResolveSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const data = await resolveAttendanceAnomaly(parsed.data);

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to resolve the attendance anomaly." },
      { status: 400 }
    );
  }
}
