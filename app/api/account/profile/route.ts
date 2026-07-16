import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles, users } from "@/lib/db/schema";
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

  const { firstName, lastName, ...profileData } = parsed.data;

  // The name lives on the users table and is mirrored from Clerk on every
  // sync, so Clerk has to be updated first or the change would be reverted
  // on the next account page load.
  if (firstName !== undefined || lastName !== undefined) {
    const client = await clerkClient();

    // Clerk's REST API accepts null to clear a name; its TS type only admits
    // strings, hence the cast.
    await client.users.updateUser(context.user.clerkUserId, {
      ...(firstName !== undefined ? { firstName: firstName ?? null } : {}),
      ...(lastName !== undefined ? { lastName: lastName ?? null } : {}),
    } as Parameters<typeof client.users.updateUser>[1]);

    await db
      .update(users)
      .set({
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, context.user.id));
  }

  const values = stripUndefined(profileData);

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
