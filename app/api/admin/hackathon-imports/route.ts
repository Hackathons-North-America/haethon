import { after, NextResponse } from "next/server";

import { requireAdminUserId } from "@/lib/auth";
import { revalidateHackathonCaches } from "@/lib/hackathons/catalog";
import { importAdminHackathons } from "@/lib/hackathons/review-service";
import { adminHackathonImportSchema } from "@/lib/validations/hackathon";

/* Also covers the work deferred with after(): vetting images and draining the
   Discord channel queue. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const gate = await requireAdminUserId();

  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason }, { status: gate.reason === "unauthenticated" ? 401 : 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = adminHackathonImportSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await importAdminHackathons({
      payloads: parsed.data.hackathons,
      reviewerUserId: gate.userId,
      ignoreDuplicates: parsed.data.ignoreDuplicates ?? false,
      // Validation, duplicate checks and the writes are done before the
      // response; image vetting and Discord run after it.
      defer: after,
    });

    // Belt and braces for the prerendered catalog: drop it once the import's
    // writes are committed. Channel jobs queued for auto-approved rows
    // invalidate again when they finish in the background.
    revalidateHackathonCaches();

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import hackathons." },
      { status: 400 }
    );
  }
}
