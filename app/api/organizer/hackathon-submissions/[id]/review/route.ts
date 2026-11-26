import { after, NextResponse } from "next/server";

import { getCurrentIdentity, isOrganizerRole } from "@/lib/auth";
import { getApprovedOrganizationIdsForUser, reviewHackathonSubmission } from "@/lib/hackathons/review-service";
import { drainDiscordReviewQueueSafely } from "@/lib/discord/review-queue";
import { reviewActionErrorPayload, reviewActionSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const userContext = await getCurrentIdentity();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  if (!isOrganizerRole(userContext.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = reviewActionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: reviewActionErrorPayload(parsed.error) }, { status: 400 });
  }

  const { id } = await context.params;
  const organizationIds = await getApprovedOrganizationIdsForUser(userContext.userId);

  try {
    const result = await reviewHackathonSubmission({
      action: parsed.data,
      reviewerUserId: userContext.userId,
      submissionId: id,
      allowedOrganizationIds: organizationIds,
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
