"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { showLoginRequiredDialog } from "@/components/login-required-dialog";

function handleUnauthenticated() {
  showLoginRequiredDialog();
}

export function MarkAttendedButton({ userHackathonId }: { userHackathonId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markAttended() {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/user-hackathons/${encodeURIComponent(userHackathonId)}`, {
        body: JSON.stringify({ applicationStatus: "attended" }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

      if (!response.ok) {
        setError(typeof payload?.error === "string" ? payload.error : "Could not mark attendance.");
        return;
      }

      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        className="inline-flex rounded-full min-h-8 items-center border border-pine dark:border-moss/50 px-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-pine dark:text-moss transition-colors hover:bg-pine hover:text-wheat disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        onClick={markAttended}
        type="button"
      >
        {pending ? "Saving…" : "Mark attended"}
      </button>
      {error ? <p className="mt-1 text-sm text-[#B3261E]">{error}</p> : null}
    </div>
  );
}
