import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { reviewHackathonSubmission } from "@/lib/hackathons/review-service";
import { sendSubmissionEmail } from "@/lib/notifications/submissions";
import { reviewActionErrorPayload, reviewActionSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  const parsed = reviewActionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: reviewActionErrorPayload(parsed.error) }, { status: 400 });
  }

  const { id } = await context.params;

  try {
    const result = await reviewHackathonSubmission({
      action: parsed.data,
      reviewerUserId: gate.user.id,
      submissionId: id,
    });
    const [submitter] = await db.select({ email: users.email }).from(users).where(eq(users.id, result.submission.submittedByUserId)).limit(1);

    await sendSubmissionEmail({
      to: submitter?.email,
      status: result.submission.status === "approved" ? "approved" : result.submission.status === "merged" ? "merged" : "rejected",
      hackathonName: result.submission.normalizedName,
      reason: result.submission.rejectionReason,
      hackathonUrl: result.approvedHackathonId ? "/hackathons" : null,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to review submission." },
      { status: 400 }
    );
  }
}
