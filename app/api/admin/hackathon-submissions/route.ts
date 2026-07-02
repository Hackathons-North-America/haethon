import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { listHackathonSubmissions } from "@/lib/hackathons/review-service";

export async function GET() {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const rows = await listHackathonSubmissions({ limit: 200 });

  return NextResponse.json({ data: rows });
}
