import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { countryAlertSubscriptions } from "@/lib/db/schema";
import { normalizeCountrySelections } from "@/lib/hackathons/countries";

const countryAlertSchema = z.object({
  country: z.string().min(1).max(120),
  frequency: z.enum(["instant", "daily", "weekly"]),
});

/* Creates or replaces the caller's single country alert — the unique userId
   column means saving a new country swaps the old one out. */
export async function PUT(request: Request) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = countryAlertSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [country] = normalizeCountrySelections([parsed.data.country]);

  if (!country) {
    return NextResponse.json({ error: "Unknown country." }, { status: 400 });
  }

  const now = new Date();
  const [existing] = await db
    .select({ country: countryAlertSubscriptions.country })
    .from(countryAlertSubscriptions)
    .where(eq(countryAlertSubscriptions.userId, userContext.user.id))
    .limit(1);

  // Switching country restarts the watermark at "now" so the subscriber is
  // alerted about future additions, not the new country's existing backlog.
  const resetWatermark = !existing || existing.country !== country;

  await db
    .insert(countryAlertSubscriptions)
    .values({
      userId: userContext.user.id,
      country,
      frequency: parsed.data.frequency,
      lastNotifiedAt: now,
    })
    .onConflictDoUpdate({
      target: countryAlertSubscriptions.userId,
      set: {
        country,
        frequency: parsed.data.frequency,
        updatedAt: now,
        ...(resetWatermark ? { lastNotifiedAt: now } : {}),
      },
    });

  return NextResponse.json({ data: { country, frequency: parsed.data.frequency } });
}

export async function DELETE() {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  await db.delete(countryAlertSubscriptions).where(eq(countryAlertSubscriptions.userId, userContext.user.id));

  return NextResponse.json({ data: { removed: true } });
}
