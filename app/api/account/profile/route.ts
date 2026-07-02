import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { profileUpdateSchema } from "@/lib/validations/hackathon";

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

export async function PATCH(request: Request) {
  const context = await getCurrentUserContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = profileUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const values = stripUndefined(parsed.data);

  const [profile] = await db
    .insert(userProfiles)
    .values({
      userId: context.user.id,
      ...values,
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: {
        ...values,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ data: profile });
}
