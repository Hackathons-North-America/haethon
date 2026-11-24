"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { useTrackStatus, type TrackableStatus } from "@/lib/hackathons/use-track-status";

export type { TrackableStatus } from "@/lib/hackathons/use-track-status";

const stages: { value: TrackableStatus; label: string }[] = [
  { value: "interested", label: "Interested" },
  { value: "applied", label: "Applied" },
  { value: "attending", label: "Attending" },
];

const stageOrder: Record<string, number> = {
  interested: 0,
  applied: 1,
  attending: 2,
  attended: 3,
  won: 3,
};

export function HackathonStatusTracker({
  hackathonId,
  hackathonName,
  initialStatus,
  compact = false,
}: {
  hackathonId: string;
  hackathonName?: string;
  initialStatus: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  // Clicks show instantly; the save (and the page refresh that resyncs
  // dashboard counts) runs in the background.
  const { status, select } = useTrackStatus(hackathonId, initialStatus, {
    hackathonName,
    onSaved: () => router.refresh(),
  });

  const currentOrder = status ? stageOrder[status] ?? -1 : -1;
  const isPastPipeline = status === "attended" || status === "won";

  function selectStage(nextStatus: TrackableStatus) {
    if (status === nextStatus || isPastPipeline) {
      return;
    }

    select(nextStatus);
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
            className={`inline-flex items-center gap-1.5 border px-3 font-medium transition-colors disabled:opacity-60 ${
              compact ? "min-h-8" : "min-h-9"
            } ${
              active
                ? "border-pine bg-pine text-paper"
                : reached
                  ? "border-pine/40 bg-pine/5 text-pine hover:bg-pine/10"
                  : "border-ink/15 bg-surface text-ink/55 hover:border-pine/40 hover:text-pine"
            }`}
            disabled={isPastPipeline}
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
        <span className="inline-flex rounded-full min-h-8 items-center border border-ink/10 bg-paper px-3 font-medium text-ink">
          {status === "won" ? "Won" : "Attended"}
        </span>
      ) : null}
    </div>
  );
}
