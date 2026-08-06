"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { showLoginRequiredDialog } from "@/components/login-required-dialog";

export type TrackableStatus = "interested" | "applied" | "accepted" | "attending";

function handleUnauthenticated() {
  showLoginRequiredDialog();
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
                ? "border-pine dark:border-moss/50 bg-pine text-paper dark:bg-paper dark:text-[#141414] dark:hover:bg-white"
                : reached
                  ? "border-pine/40 bg-pine/5 dark:bg-moss/10 text-pine dark:text-moss hover:bg-pine/10"
                  : "border-ink/15 dark:border-white/15 bg-white dark:bg-white/[0.06] text-ink/55 dark:text-paper/55 hover:border-pine/40 dark:hover:border-moss/40 hover:text-pine dark:hover:text-moss"
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
        <span className="inline-flex rounded-full min-h-8 items-center border border-ink/10 dark:border-white/10 bg-paper dark:bg-white/5 px-3 font-medium text-ink dark:text-paper">
          {status === "won" ? "Won" : "Attended"}
        </span>
      ) : null}
    </div>
  );
}
