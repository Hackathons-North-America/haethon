import { and, eq, inArray, ne, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { userFollows, userHackathons, users } from "@/lib/db/schema";
import type { HackathonFriend } from "@/lib/follows/activity";

export type { HackathonFriend } from "@/lib/follows/activity";

export type FollowState = {
  id: string;
  status: "pending" | "approved";
};

/** The viewer's follow edge toward one user, for the profile-page button. */
export async function getFollowState(followerId: string, followeeId: string): Promise<FollowState | null> {
  const [row] = await db
    .select({ id: userFollows.id, status: userFollows.status })
    .from(userFollows)
    .where(and(eq(userFollows.followerId, followerId), eq(userFollows.followeeId, followeeId)))
    .limit(1);

  return row ?? null;
}

/**
 * The viewer's approved followees who have any of the given hackathons on
 * their board, grouped by hackathon. One query for a whole catalog page.
 */
export async function getFriendActivityByHackathon(
  viewerId: string,
  hackathonIds: string[]
): Promise<Map<string, HackathonFriend[]>> {
  const activity = new Map<string, HackathonFriend[]>();

  if (!hackathonIds.length) {
    return activity;
  }

  const rows = await db
    .select({
      hackathonId: userHackathons.hackathonId,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      imageUrl: users.imageUrl,
      status: userHackathons.applicationStatus,
    })
    .from(userFollows)
    .innerJoin(users, eq(users.id, userFollows.followeeId))
    .innerJoin(userHackathons, eq(userHackathons.userId, userFollows.followeeId))
    .where(
      and(
        eq(userFollows.followerId, viewerId),
        eq(userFollows.status, "approved"),
        inArray(userHackathons.hackathonId, hackathonIds),
        // Mirrors the My Hackathons visibility rule: an unsaved row still at
        // the default "interested" stage isn't on their board, so friends
        // don't see it either.
        or(eq(userHackathons.isSaved, true), ne(userHackathons.applicationStatus, "interested"))
      )
    );

  for (const row of rows) {
    const friends = activity.get(row.hackathonId) ?? [];

    friends.push({
      username: row.username,
      name: [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.username,
      imageUrl: row.imageUrl,
      status: row.status,
    });
    activity.set(row.hackathonId, friends);
  }

  return activity;
}
