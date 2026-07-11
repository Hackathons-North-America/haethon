import { NextResponse } from "next/server";

import { getCurrentUserContext, isOrganizerRole } from "@/lib/auth";
import { canManageHackathon, getActiveCheckinCode, rotateCheckinCode } from "@/lib/hackathons/checkin-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function authorize(context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return { error: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) } as const;
  }

  if (!isOrganizerRole(userContext.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }

  const { id } = await context.params;

  if (!(await canManageHackathon({ userId: userContext.user.id, role: userContext.role, hackathonId: id }))) {
    return { error: NextResponse.json({ error: "You don't organize this hackathon." }, { status: 403 }) } as const;
  }

  return { userContext, hackathonId: id } as const;
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await authorize(context);

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const active = await getActiveCheckinCode(auth.hackathonId);

    return NextResponse.json({
      data: active ? { code: active.code, createdAt: active.createdAt, expiresAt: active.expiresAt } : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load the check-in code." },
      { status: 500 }
    );
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await authorize(context);

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const created = await rotateCheckinCode({
      hackathonId: auth.hackathonId,
      createdByUserId: auth.userContext.user.id,
    });

    return NextResponse.json(
      { data: { code: created.code, createdAt: created.createdAt, expiresAt: created.expiresAt } },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate a code." },
      { status: 500 }
    );
  }
}
