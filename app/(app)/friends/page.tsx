import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { FollowRequestActions, RemoveFollowButton } from "@/components/friends/friend-controls";
import { FriendAvatar } from "@/components/hackathon-friends";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { userFollows, users } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Friends | Hackathons North America",
  description: "Follow other hackers and see which hackathons they're going to.",
};

type FriendRow = {
  followId: string;
  status: "pending" | "approved";
  username: string;
  name: string;
  imageUrl: string | null;
};

function toFriendRow(row: {
  followId: string;
  status: "pending" | "approved";
  username: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
}): FriendRow {
  return {
    followId: row.followId,
    status: row.status,
    username: row.username,
    name: [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.username,
    imageUrl: row.imageUrl,
  };
}

function FriendIdentity({ friend }: { friend: FriendRow }) {
  return (
    <Link className="group flex min-w-0 flex-1 items-center gap-3" href={`/p/${friend.username}`}>
      <FriendAvatar friend={friend} sizeClassName="size-9" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink group-hover:text-pine">{friend.name}</span>
        <span className="block truncate text-xs text-ink/55">@{friend.username}</span>
      </span>
    </Link>
  );
}

export default async function FriendsPage() {
  const userId = await getCurrentUserId();

  if (!userId) {
    redirect("/sign-in");
  }

  const followerUsers = {
    followId: userFollows.id,
    status: userFollows.status,
    username: users.username,
    firstName: users.firstName,
    lastName: users.lastName,
    imageUrl: users.imageUrl,
  };

  const [incomingRows, followingRows] = await Promise.all([
    db
      .select(followerUsers)
      .from(userFollows)
      .innerJoin(users, eq(users.id, userFollows.followerId))
      .where(eq(userFollows.followeeId, userId))
      .orderBy(asc(userFollows.createdAt)),
    db
      .select(followerUsers)
      .from(userFollows)
      .innerJoin(users, eq(users.id, userFollows.followeeId))
      .where(eq(userFollows.followerId, userId))
      .orderBy(asc(userFollows.createdAt)),
  ]);

  const requests = incomingRows.filter((row) => row.status === "pending").map(toFriendRow);
  const following = followingRows.map(toFriendRow);

  return (
    <main className="min-h-screen px-5 pb-40 pt-10 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[720px]">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Friends</h1>
        <p className="mt-2 max-w-[520px] text-sm leading-6 text-ink/55">
          Follow hackers you know and their plans show up on hackathons — &ldquo;going&rdquo;, &ldquo;applied&rdquo;,
          &ldquo;interested&rdquo;. Find people via their profile link.
        </p>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">
            Requests{requests.length ? ` · ${requests.length}` : ""}
          </h2>
          {requests.length ? (
            <ul className="mt-3 divide-y divide-ink/10 border-y border-ink/10">
              {requests.map((request) => (
                <li className="flex items-center gap-3 py-3" key={request.followId}>
                  <FriendIdentity friend={request} />
                  <FollowRequestActions followId={request.followId} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink/55">No pending requests.</p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">
            Following{following.length ? ` · ${following.length}` : ""}
          </h2>
          {following.length ? (
            <ul className="mt-3 divide-y divide-ink/10 border-y border-ink/10">
              {following.map((friend) => (
                <li className="flex items-center gap-3 py-3" key={friend.followId}>
                  <FriendIdentity friend={friend} />
                  {friend.status === "pending" ? (
                    <span className="shrink-0 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink/45">
                      Requested
                    </span>
                  ) : null}
                  <RemoveFollowButton
                    followId={friend.followId}
                    label={friend.status === "pending" ? "Cancel" : "Unfollow"}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink/55">
              You aren&apos;t following anyone yet. Open a hacker&apos;s profile and hit Follow.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
