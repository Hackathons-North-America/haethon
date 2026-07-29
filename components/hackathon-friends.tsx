import Image from "next/image";
import Link from "next/link";

import { friendStatusPhrases, type HackathonFriend } from "@/lib/follows/activity";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export function FriendAvatar({
  friend,
  sizeClassName = "size-5",
}: {
  friend: Pick<HackathonFriend, "name" | "imageUrl">;
  sizeClassName?: string;
}) {
  return friend.imageUrl ? (
    <Image
      alt={friend.name}
      className={`${sizeClassName} shrink-0 rounded-full object-cover`}
      height={40}
      src={friend.imageUrl}
      unoptimized
      width={40}
    />
  ) : (
    <span
      className={`grid ${sizeClassName} shrink-0 place-items-center rounded-full bg-pine/15 text-[9px] font-semibold text-pine`}
    >
      {getInitials(friend.name) || "?"}
    </span>
  );
}

function summarize(friends: HackathonFriend[]) {
  const [first] = friends;

  if (!first) {
    return null;
  }

  const firstName = first.name.split(/\s+/)[0] ?? first.name;

  return friends.length === 1
    ? `${firstName} ${friendStatusPhrases[first.status] ?? "is in"}`
    : `${firstName} and ${friends.length - 1} more are in`;
}

/* The card's one-line social nudge: a tiny overlapping avatar stack plus
   "James is going" / "James and 2 more are in". Sized to sit in the sliver
   between the card's location line and its description. */
export function FriendAvatarRow({ friends }: { friends?: HackathonFriend[] }) {
  if (!friends?.length) {
    return null;
  }

  const summary = summarize(friends);
  const detail = friends
    .map((friend) => `${friend.name} ${friendStatusPhrases[friend.status] ?? "is in"}`)
    .join(" · ");

  return (
    <div className="mt-2 flex min-w-0 items-center gap-2" title={detail}>
      <div className="flex shrink-0 -space-x-1.5">
        {friends.slice(0, 3).map((friend) => (
          <span className="rounded-full ring-2 ring-paper" key={friend.username}>
            <FriendAvatar friend={friend} />
          </span>
        ))}
      </div>
      <span className="truncate text-xs font-medium text-pine">{summary}</span>
    </div>
  );
}

/* The detail page's fuller list: one row per friend, linking to their public
   profile with their pipeline stage spelled out. */
export function HackathonFriendsSection({ friends }: { friends: HackathonFriend[] }) {
  if (!friends.length) {
    return null;
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Friends</h2>
      <ul className="mt-3 space-y-1">
        {friends.map((friend) => (
          <li key={friend.username}>
            <Link
              className="group flex min-h-10 items-center gap-3 px-2 transition-colors hover:bg-ink/5"
              href={`/p/${friend.username}`}
            >
              <FriendAvatar friend={friend} sizeClassName="size-7" />
              <span className="min-w-0 truncate text-sm">
                <span className="font-medium text-ink group-hover:text-pine">{friend.name}</span>
                <span className="text-ink/55"> {friendStatusPhrases[friend.status] ?? "is in"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
