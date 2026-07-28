import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth";
import { importAdminHackathonFixItems, listHackathonSubmissions } from "@/lib/hackathons/review-service";
import { adminHackathonFixImportSchema } from "@/lib/validations/hackathon";

export async function POST(request: Request) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = adminHackathonFixImportSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await importAdminHackathonFixItems({
      items: parsed.data.items,
      reviewerUserId: gate.user.id,
    });
    const submissionIds = result.results.map((item) => item.submissionId);
    const importedSubmissions = await listHackathonSubmissions({
      limit: submissionIds.length,
      submissionIds,
    });
    const submissionsById = new Map(importedSubmissions.map((submission) => [submission.id, submission]));
    const submissions = submissionIds.flatMap((id) => {
      const submission = submissionsById.get(id);

      return submission ? [submission] : [];
    });

    return NextResponse.json({ data: { ...result, submissions } }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import fix queue." },
      { status: 400 }
    );
  }
}
