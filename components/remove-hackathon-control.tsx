"use client";

import { Trash2 } from "lucide-react";

import { scheduleUndoableRequest } from "@/lib/client/background-actions";

/* Trash button on the My Hackathons cards. Clicking hides the card at once
   (onRemove) and shows a "Removed … [Undo]" toast; the DELETE of the tracking
   row is only sent once the undo window passes. Undo, or a failed request,
   brings the card back through onRestore. */
export function RemoveHackathonControl({
  className,
  hackathonId,
  hackathonName,
  listLabel,
  onRemove,
  onRestore,
  onRemoved,
}: {
  className?: string;
  hackathonId: string;
  hackathonName: string;
  /* The list the card currently sits in — "Interested", "Applied", "Attending",
     or "Past" — surfaced in the toast copy. */
  listLabel: string;
  /** Hide the card now (optimistic). */
  onRemove: () => void;
  /** Bring the card back: the user pressed Undo or the request failed. */
  onRestore: () => void;
  /** The server confirmed the removal. */
  onRemoved?: () => void;
}) {
  function stopPropagation(event: { stopPropagation: () => void }) {
    event.stopPropagation();
  }

  function remove() {
    onRemove();
    scheduleUndoableRequest({
      message: `Removed ${hackathonName} from your ${listLabel} list.`,
      failureMessage: `Couldn't remove ${hackathonName}.`,
      url: `/api/hackathons/${encodeURIComponent(hackathonId)}/track`,
      init: { method: "DELETE" },
      onUndo: onRestore,
      onCommitted: onRemoved,
      retry: remove,
    });
  }

  return (
    <button
      aria-label={`Remove ${hackathonName} from your ${listLabel} list`}
      className={
        className ??
        "relative z-20 grid size-8 place-items-center rounded-full text-ink/55 transition-colors hover:bg-pine/10 hover:text-pine focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35"
      }
      draggable={false}
      onClick={(event) => {
        stopPropagation(event);
        remove();
      }}
      onMouseDown={stopPropagation}
      onPointerDown={stopPropagation}
      title="Remove from my hackathons"
      type="button"
    >
      <Trash2 aria-hidden="true" className="size-4" />
    </button>
  );
}
