import { NextResponse } from "next/server";

import { serializeAdminHackathon } from "@/components/admin/hackathon-admin-item";
import { requireAdminUser } from "@/lib/auth";
import { syncHackathonDiscordChannelSafely } from "@/lib/discord/sync";
import { getAdminHackathon, setHackathonHnaApproved } from "@/lib/hackathons/admin-service";
import { adminHackathonHnaApprovedSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Sets or clears "HNA approved" from the one-click toggle on the admin
 * hackathon cards. Kept separate from the full-payload update route, like the
 * recurring toggle, so a click never round-trips every editable field. It
 * then runs the same Discord sync the edit dialog's save does, so approving a
 * Canadian or US hackathon gets its channel straight away.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const parsed = adminHackathonHnaApprovedSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;

  try {
    await setHackathonHnaApproved(id, parsed.data.hnaApproved);
    await syncHackathonDiscordChannelSafely(id);

    const updated = await getAdminHackathon(id);

    if (!updated) {
      return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
    }

    return NextResponse.json({ data: serializeAdminHackathon(updated) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update HNA approval." },
      { status: 400 }
    );
  }
}
