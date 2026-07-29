"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, UserPlus } from "lucide-react";

function handleUnauthenticated() {
  window.location.href = "/sign-in";
}

export type FollowButtonState = {
  id: string;
  status: "pending" | "approved";
} | null;

/* The profile page's Follow control, cycling Follow → Requested → Following.
   Clicking Requested cancels the request; clicking Following unfollows. */
export function FollowButton({
  username,
  initialFollow,
}: {
  username: string;
  initialFollow: FollowButtonState;
}) {
  const router = useRouter();
  const [follow, setFollow] = useState(initialFollow);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) {
      return;
    }

    const previous = follow;

    setPending(true);

    try {
      if (follow) {
        setFollow(null);

        const response = await fetch(`/api/follows/${encodeURIComponent(follow.id)}`, { method: "DELETE" });

        if (response.status === 401) {
          handleUnauthenticated();
          return;
        }

        if (!response.ok) {
          throw new Error("Could not unfollow.");
        }
      } else {
        const response = await fetch("/api/follows", {
          body: JSON.stringify({ username }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        if (response.status === 401) {
          handleUnauthenticated();
          return;
        }

        if (!response.ok) {
          throw new Error("Could not follow.");
        }

        const body = (await response.json()) as { data: NonNullable<FollowButtonState> };

        setFollow(body.data);
      }

      router.refresh();
    } catch {
      setFollow(previous);
    } finally {
      setPending(false);
    }
  }

  const label = follow ? (follow.status === "approved" ? "Following" : "Requested") : "Follow";

  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:cursor-wait disabled:opacity-60 ${
        follow
          ? "border border-pine/40 bg-pine/5 text-pine hover:border-pine hover:bg-pine/10"
          : "bg-pine text-paper hover:bg-pine/90"
      }`}
      disabled={pending}
      onClick={toggle}
      title={
        follow
          ? follow.status === "approved"
            ? `Unfollow @${username}`
            : "Cancel follow request"
          : `Follow @${username} to see their hackathon plans`
      }
      type="button"
    >
      {follow ? (
        follow.status === "approved" ? (
          <Check aria-hidden="true" className="size-4" />
        ) : null
      ) : (
        <UserPlus aria-hidden="true" className="size-4" />
      )}
      {label}
    </button>
  );
}
