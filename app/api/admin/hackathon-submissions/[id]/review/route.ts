import { after, NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { reviewHackathonSubmission } from "@/lib/hackathons/review-service";
import { drainDiscordReviewQueueSafely } from "@/lib/discord/review-queue";
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

    // Takes the buttons off this submission's message in the Discord review channel.
    after(drainDiscordReviewQueueSafely);

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to review submission." },
      { status: 400 }
    );
  }
}
