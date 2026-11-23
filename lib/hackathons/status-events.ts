"use client";

import { useEffect, useRef } from "react";

/* With the side panel open next to the catalog, the same hackathon's status
   can be changed from its card or from the panel's tracker. Each keeps its own
   optimistic state, so they announce successful changes on a window event and
   listen for each other's, keeping both in step without a shared store. */

const STATUS_EVENT = "hna:hackathon-status";

type StatusEventDetail = { hackathonId: string; status: string | null };

export function announceHackathonStatus(hackathonId: string, status: string | null) {
  window.dispatchEvent(
    new CustomEvent<StatusEventDetail>(STATUS_EVENT, { detail: { hackathonId, status } })
  );
}

export function useHackathonStatusListener(hackathonId: string, onChange: (status: string | null) => void) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    function handle(event: Event) {
      const { detail } = event as CustomEvent<StatusEventDetail>;

      if (detail.hackathonId === hackathonId) {
        onChangeRef.current(detail.status);
      }
    }

    window.addEventListener(STATUS_EVENT, handle);
    return () => window.removeEventListener(STATUS_EVENT, handle);
  }, [hackathonId]);
}
