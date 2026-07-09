import { NextResponse } from "next/server";

import { getCurrentUserContext, isOrganizerRole } from "@/lib/auth";
import { updatePublishedHackathon } from "@/lib/hackathons/admin-service";
import { canManageHackathon } from "@/lib/hackathons/checkin-service";
import { adminHackathonUpdateSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  if (!isOrganizerRole(userContext.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = adminHackathonUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;

  if (!(await canManageHackathon({ userId: userContext.user.id, role: userContext.role, hackathonId: id }))) {
    return NextResponse.json({ error: "You don't organize this hackathon." }, { status: 403 });
  }

  try {
    const data = await updatePublishedHackathon(id, parsed.data);

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update hackathon." },
      { status: 400 }
    );
  }
}
