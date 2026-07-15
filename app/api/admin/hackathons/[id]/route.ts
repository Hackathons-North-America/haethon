import { NextResponse } from "next/server";

import { serializeAdminHackathon } from "@/components/admin/hackathon-admin-item";
import { requireAdminUser } from "@/lib/auth";
import { assignExistingDiscordChannel } from "@/lib/discord/sync";
import { deleteHackathon, getAdminHackathon, updatePublishedHackathon } from "@/lib/hackathons/admin-service";
import { adminHackathonEditSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const { id } = await context.params;
  const row = await getAdminHackathon(id);

  if (!row) {
    return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
  }

  return NextResponse.json({ data: serializeAdminHackathon(row) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const parsed = adminHackathonEditSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;

  try {
    const { discordChannelId, ...payload } = parsed.data;

    if (discordChannelId) {
      await assignExistingDiscordChannel(id, discordChannelId);
    }

    const data = await updatePublishedHackathon(id, payload);

    return NextResponse.json({ data: serializeAdminHackathon(data) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update hackathon." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const { id } = await context.params;

  try {
    const deletedId = await deleteHackathon(id);

    return NextResponse.json({ data: { id: deletedId } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete hackathon." },
      { status: 400 }
    );
  }
}
