import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUserRecord } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const emailPreferencesSchema = z.object({ enabled: z.boolean() });

/* Session-authed counterpart to the signed-link unsubscribe: the account
   settings toggle for turning all Haethon emails off or back on. */
export async function PATCH(request: Request) {
  const user = await getCurrentUserRecord();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = emailPreferencesSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Expected { enabled: boolean }." }, { status: 400 });
  }

  await db
    .update(users)
    .set({ emailUnsubscribedAt: parsed.data.enabled ? null : new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return NextResponse.json({ data: { enabled: parsed.data.enabled } });
}
