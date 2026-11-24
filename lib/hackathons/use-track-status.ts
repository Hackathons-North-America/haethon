"use client";

import { useEffect, useRef, useState } from "react";

import { reportBackgroundFailure } from "@/lib/client/background-actions";
import { sendRequest } from "@/lib/client/request";
import { useLatestSave } from "@/lib/client/use-latest-save";
import { announceHackathonStatus, useHackathonStatusListener } from "@/lib/hackathons/status-events";

export type TrackableStatus = "interested" | "applied" | "attending";

/**
 * Optimistic interested / applied / attending tracking for one hackathon,
 * shared by the card's status stack and the detail panel's tracker. Every
 * click shows immediately; saves run in the background with the last click
 * winning. A failed save snaps back to the last confirmed status and raises a
 * toast with a retry.
 */
export function useTrackStatus(
  hackathonId: string,
  initialStatus: string | null | undefined,
  { hackathonName, onSaved }: { hackathonName?: string; onSaved?: () => void } = {}
) {
  const [status, setStatus] = useState<string | null>(initialStatus ?? null);
  const confirmedRef = useRef<string | null>(initialStatus ?? null);

  /* The static catalog renders cards without a viewer and fills the stage in
     a moment later (from /api/hackathons/card-state), so the prop can change
     after mount. Follow it by adjusting state during render rather than
     remounting on a key, which would drop keyboard focus from the buttons. */
  const [seenInitialStatus, setSeenInitialStatus] = useState<string | null>(initialStatus ?? null);

  if ((initialStatus ?? null) !== seenInitialStatus) {
    setSeenInitialStatus(initialStatus ?? null);
    setStatus(initialStatus ?? null);
  }

  useEffect(() => {
    confirmedRef.current = initialStatus ?? null;
  }, [initialStatus]);

  const { save, isSaving } = useLatestSave<TrackableStatus | null, unknown>(
    (next) =>
      sendRequest(
        `/api/hackathons/${encodeURIComponent(hackathonId)}/track`,
        next === null ? { method: "DELETE" } : { method: "PATCH", json: { applicationStatus: next } }
      ),
    {
      onSuccess: (_result, value, { latest }) => {
        confirmedRef.current = value;

        if (latest) {
          announceHackathonStatus(hackathonId, value);
          onSaved?.();
        }
      },
      onError: (error, value) => {
        setStatus(confirmedRef.current);
        reportBackgroundFailure(error, {
          message: hackathonName ? `Couldn't update ${hackathonName}.` : "Couldn't update your status.",
          retry: () => select(value),
        });
      },
    }
  );

  // Follow confirmed changes made from this hackathon's other control (card
  // vs. side panel). While this control is mid-save its own value wins.
  useHackathonStatusListener(hackathonId, (next) => {
    confirmedRef.current = next;

    if (!isSaving()) {
      setStatus(next);
    }
  });

  function select(next: TrackableStatus | null) {
    setStatus(next);
    save(next);
  }

  return { status, select };
}
