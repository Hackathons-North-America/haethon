"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

export type TrackableStatus = "interested" | "applied" | "accepted" | "attending";

function handleUnauthenticated() {
  window.location.href = "/sign-in";
}

const stages: { value: TrackableStatus; label: string }[] = [
  { value: "interested", label: "Interested" },
  { value: "applied", label: "Applied" },
  { value: "accepted", label: "Accepted" },
  { value: "attending", label: "Attending" },
];

const stageOrder: Record<string, number> = {
  interested: 0,
  applied: 1,
  accepted: 2,
  attending: 3,
  attended: 4,
  won: 4,
};

export function HackathonStatusTracker({
  hackathonId,
  initialStatus,
  compact = false,
}: {
  hackathonId: string;
  initialStatus: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);

  const currentOrder = status ? stageOrder[status] ?? -1 : -1;
  const isPastPipeline = status === "attended" || status === "won";

  async function selectStage(nextStatus: TrackableStatus) {
    if (pending || status === nextStatus || isPastPipeline) {
      return;
    }

    const previousStatus = status;

    setStatus(nextStatus);
    setPending(true);

    try {
      const response = await fetch(`/api/hackathons/${encodeURIComponent(hackathonId)}/track`, {
        body: JSON.stringify({ applicationStatus: nextStatus }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      if (!response.ok) {
        throw new Error("Could not update status.");
      }

      router.refresh();
    } catch {
      setStatus(previousStatus);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      aria-label="Application status"
      className={`inline-flex flex-wrap items-center gap-1.5 font-mono uppercase tracking-[0.12em] ${
        compact ? "text-[11px]" : "text-xs"
      }`}
      role="group"
    >
      {stages.map((stage) => {
        const reached = currentOrder >= stageOrder[stage.value];
        const active = status === stage.value;

        return (
          <button
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 border px-3 font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${
              compact ? "min-h-8" : "min-h-9"
            } ${
              active
                ? "border-cabernet dark:border-[#e4a3ab]/50 bg-cabernet text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white"
                : reached
                  ? "border-cabernet/40 bg-cabernet/5 dark:bg-[#e4a3ab]/10 text-cabernet dark:text-[#e4a3ab] hover:bg-cabernet/10"
                  : "border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] text-navy/55 dark:text-wheat/55 hover:border-cabernet/40 dark:hover:border-[#e4a3ab]/40 hover:text-cabernet dark:hover:text-[#e4a3ab]"
            }`}
            disabled={pending || isPastPipeline}
            key={stage.value}
            onClick={() => selectStage(stage.value)}
            type="button"
          >
            {reached ? <Check aria-hidden="true" className="size-3.5" /> : null}
            {stage.label}
          </button>
        );
      })}
      {isPastPipeline ? (
        <span className="inline-flex rounded-full min-h-8 items-center border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-3 font-medium text-navy dark:text-wheat">
          {status === "won" ? "Won" : "Attended"}
        </span>
      ) : null}
    </div>
  );
}
