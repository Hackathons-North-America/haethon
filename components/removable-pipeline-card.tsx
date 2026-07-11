"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function RemovablePipelineCard({
  hackathonId,
  children,
}: {
  hackathonId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);

  async function remove() {
    if (pending) {
      return;
    }

    setPending(true);

    try {
      const response = await fetch(`/api/hackathons/${encodeURIComponent(hackathonId)}/track`, {
        method: "DELETE",
      });

      if (response.status === 401) {
        window.location.href = "/sign-in";
        return;
      }

      if (!response.ok) {
        throw new Error("Could not remove hackathon.");
      }

      // Hide immediately, then let the server re-render the pipeline without it.
      setRemoved(true);
      router.refresh();
    } catch {
      setPending(false);
    }
  }

  if (removed) {
    return null;
  }

  return (
    <article className="relative rounded-lg border border-black/10 bg-[#F7F7F4] p-5">
      <button
        aria-label="Remove from my hackathons"
        className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-full text-[#706F6B] transition-colors hover:bg-[#660000]/10 hover:text-[#660000] disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        onClick={remove}
        title="Remove from my hackathons"
        type="button"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
      {children}
    </article>
  );
}
