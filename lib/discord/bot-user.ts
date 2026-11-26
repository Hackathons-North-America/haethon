import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/* Discord accounts are not linked to Haethon accounts, but every submission
   names a submitter. Submissions from /add-hackathon are recorded under this
   one system account, with the Discord user kept in the payload
   (discordSubmitter). It has the plain "user" role, so nothing it submits
   publishes without review. The ids can never collide with a real account:
   Clerk ids start with "user_" and .invalid is a reserved domain. */
export const DISCORD_BOT_CLERK_ID = "system:discord-bot";
const DISCORD_BOT_EMAIL = "discord-bot@haethon.invalid";
const DISCORD_BOT_USERNAME = "discord-bot";

export async function discordBotSubmitter() {
  const [existing] = await db.select().from(users).where(eq(users.clerkUserId, DISCORD_BOT_CLERK_ID)).limit(1);

  if (existing) {
    return existing;
  }

  await db
    .insert(users)
    .values({
      clerkUserId: DISCORD_BOT_CLERK_ID,
      email: DISCORD_BOT_EMAIL,
      firstName: "Discord",
      lastName: "bot",
      role: "user",
      username: DISCORD_BOT_USERNAME,
    })
    .onConflictDoNothing();

  const [created] = await db.select().from(users).where(eq(users.clerkUserId, DISCORD_BOT_CLERK_ID)).limit(1);

  if (!created) {
    throw new Error("Could not create the Discord bot account (its username or email is taken).");
  }

  return created;
}
