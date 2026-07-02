import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { hackathonSubmissions } from "@/lib/db/schema";
import { createHackathonSubmission } from "@/lib/hackathons/review-service";
import { sendSubmissionEmail } from "@/lib/notifications/submissions";
import { hackathonSubmissionSchema } from "@/lib/validations/hackathon";

export async function GET(request: Request) {
  const context = await getCurrentUserContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;

  if (searchParams.get("mine") !== "true") {
    return NextResponse.json({ error: "Only mine=true is supported on this endpoint." }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(hackathonSubmissions)
    .where(eq(hackathonSubmissions.submittedByUserId, context.user.id))
    .orderBy(desc(hackathonSubmissions.createdAt))
    .limit(50);

  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const context = await getCurrentUserContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = hackathonSubmissionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await createHackathonSubmission(parsed.data, context.user, context.role);

    await sendSubmissionEmail({
      to: context.user.email,
      status: result.publishedDirectly ? "approved" : "received",
      hackathonName: result.submission.normalizedName,
      hackathonUrl: result.publishedHackathonId ? "/hackathons" : null,
    });

    return NextResponse.json({ data: result }, { status: result.publishedDirectly ? 201 : 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create submission." },
      { status: 500 }
    );
  }
}
