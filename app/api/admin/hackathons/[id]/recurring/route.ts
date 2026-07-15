import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { setHackathonSeriesRecurring } from "@/lib/hackathons/admin-service";
import { serializeAdminHackathon } from "@/components/admin/hackathon-admin-item";
import { adminHackathonRecurringSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Marks a published hackathon's series as recurring (or clears the flag). Kept
 * separate from the full-payload update route so a one-click toggle never has
 * to round-trip every editable field.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const parsed = adminHackathonRecurringSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;

  try {
    const updated = await setHackathonSeriesRecurring(id, parsed.data.isRecurring);

    return NextResponse.json({ data: serializeAdminHackathon(updated) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update the recurring flag." },
      { status: 400 }
    );
  }
}
