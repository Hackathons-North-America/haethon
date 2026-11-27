import { after, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { requireAdminUserId } from "@/lib/auth";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";
import { decideImportCard, ImportCardError, updateImportCard } from "@/lib/hackathons/import-queue";

/* Also covers the work deferred with after(): vetting the image and draining
   the Discord channel queue. */
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

const idSchema = z.string().uuid();
const decisionSchema = z.object({ action: z.enum(["approve", "approve_new", "merge", "reject"]) });
const editSchema = z.object({ payload: z.record(z.string(), z.unknown()) });

const ERROR_STATUS = { conflict: 409, invalid: 400, not_found: 404 } as const;

function failure(error: unknown, fallback: string) {
  if (error instanceof ImportCardError) {
    return NextResponse.json({ error: error.message, details: error.details }, { status: ERROR_STATUS[error.code] });
  }

  Sentry.captureException(error);
  console.error(fallback, { error });

  return NextResponse.json({ error: fallback }, { status: 500 });
}

async function gateAndId(context: RouteContext) {
  const gate = await requireAdminUserId();

  if (!gate.ok) {
    return { response: NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 }) };
  }

  const id = idSchema.safeParse((await context.params).id);

  return id.success
    ? { submissionId: id.data, userId: gate.userId }
    : { response: NextResponse.json({ error: "Import card not found." }, { status: 404 }) };
}

/** An admin's decision on one card: approve, approve as new, merge or reject. */
export async function POST(request: Request, context: RouteContext) {
  const access = await gateAndId(context);

  if ("response" in access) {
    return access.response;
  }

  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await decideImportCard({
      action: parsed.data.action,
      reviewerUserId: access.userId,
      submissionId: access.submissionId,
      defer: after,
    });

    if (result.status === "decided" && result.result.status !== "duplicate_flagged") {
      revalidateHackathonCaches();
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    return failure(error, "Unable to apply the decision to this card.");
  }
}

/** Saves an admin's edit of a waiting card. */
export async function PATCH(request: Request, context: RouteContext) {
  const access = await gateAndId(context);

  if ("response" in access) {
    return access.response;
  }

  const parsed = editSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    return NextResponse.json({
      data: { card: await updateImportCard({ event: parsed.data.payload, submissionId: access.submissionId }) },
    });
  } catch (error) {
    return failure(error, "Unable to save this card.");
  }
}
