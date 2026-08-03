"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

import { showLoginRequiredDialog } from "@/components/login-required-dialog";

function handleUnauthenticated() {
  showLoginRequiredDialog();
}

const pillClassName =
  "inline-flex min-h-9 items-center justify-center gap-1 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:cursor-wait disabled:opacity-60";

/* Approve/Reject pair for one incoming request on the Friends page. The row
   disappears on success via router.refresh(). */
export function FollowRequestActions({ followId }: { followId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);

  async function decide(action: "approve" | "reject") {
    if (pending) {
      return;
    }

    setPending(action);

    try {
      const response = await fetch(`/api/follows/${encodeURIComponent(followId)}`, {
        body: JSON.stringify({ action }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      if (!response.ok) {
        throw new Error("Could not update the request.");
      }

      router.refresh();
    } catch {
      // The row stays; the hacker can simply try again.
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        className={`${pillClassName} bg-pine text-paper hover:bg-pine/90`}
        disabled={pending !== null}
        onClick={() => decide("approve")}
        type="button"
      >
        <Check aria-hidden="true" className="size-4" />
        Approve
      </button>
      <button
        className={`${pillClassName} border border-ink/15 text-ink/70 hover:border-ink/40 hover:text-ink`}
        disabled={pending !== null}
        onClick={() => decide("reject")}
        type="button"
      >
        <X aria-hidden="true" className="size-4" />
        Reject
      </button>
    </div>
  );
}

/* Severs an edge from the Following list: cancels a pending request or
   unfollows an approved one — the label says which. */
export function RemoveFollowButton({ followId, label }: { followId: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    if (pending) {
      return;
    }

    setPending(true);

    try {
      const response = await fetch(`/api/follows/${encodeURIComponent(followId)}`, { method: "DELETE" });

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      if (!response.ok) {
        throw new Error("Could not remove.");
      }

      router.refresh();
    } catch {
      // Leave the row in place on failure.
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      className={`${pillClassName} shrink-0 border border-ink/15 text-ink/70 hover:border-ink/40 hover:text-ink`}
      disabled={pending}
      onClick={remove}
      type="button"
    >
      {label}
    </button>
  );
}
