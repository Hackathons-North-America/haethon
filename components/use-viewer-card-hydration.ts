"use client";

import { useEffect, useState } from "react";

import { useViewerAuth, type ViewerAuth } from "@/components/viewer-auth";
import {
  VIEWER_CARD_STATE_MAX_IDS,
  type ViewerCardState,
  type ViewerCardStateResponse,
} from "@/lib/hackathons/viewer-card-state";

type Listener = (states: Record<string, ViewerCardState>) => void;

type Batch = {
  ids: string[];
  /* May be sent on the remembered sign-in, before Clerk has confirmed it. */
  eager: boolean;
};

export type ViewerCardHydration = {
  /**
   * Asks for the viewer's state for cards that were rendered without it.
   * Nothing is sent for signed-out visitors. `eager` requests go out as soon
   * as there is reason to think the visitor is signed in; the rest wait for
   * Clerk to confirm it.
   */
  request: (ids: string[], options?: { eager?: boolean }) => void;
  /** Called with each answer as it arrives. Returns the unsubscribe. */
  subscribe: (listener: Listener) => () => void;
};

/* What to do with the queue for a given sign-in state. Exported for tests. */
export function splitHydrationQueue(queue: Batch[], auth: Pick<ViewerAuth, "isConfirmed" | "isSignedIn">) {
  // Confirmed signed out: nobody to personalize for.
  if (auth.isConfirmed && !auth.isSignedIn) {
    return { send: [], keep: [] };
  }

  // Not known (or only remembered as signed out): wait for Clerk.
  if (auth.isSignedIn !== true) {
    return { send: [], keep: queue };
  }

  return {
    send: queue.filter((batch) => auth.isConfirmed || batch.eager),
    keep: queue.filter((batch) => !auth.isConfirmed && !batch.eager),
  };
}

type SignInState = Pick<ViewerAuth, "isConfirmed" | "isSignedIn">;

function createHydration(initialAuth: SignInState) {
  const listeners = new Set<Listener>();
  let auth = initialAuth;
  let queue: Batch[] = [];

  async function send(batch: Batch, confirmed: boolean) {
    try {
      const response = await fetch(`/api/hackathons/card-state?ids=${batch.ids.join(",")}`);

      if (!response.ok) {
        return;
      }

      const body = (await response.json()) as ViewerCardStateResponse;

      for (const listener of listeners) {
        listener(body.data);
      }

      // Sent on the remembered sign-in and the server saw no session: most
      // likely the session cookie had expired and Clerk hasn't refreshed it
      // yet. Ask once more when Clerk confirms the visitor is signed in.
      if (!body.signedIn && !confirmed) {
        queue.push({ ids: batch.ids, eager: false });
        flush();
      }
    } catch {
      // The cards keep their public state; nothing else depends on this.
    }
  }

  function flush() {
    const { send: ready, keep } = splitHydrationQueue(queue, auth);
    const confirmed = auth.isConfirmed;

    queue = keep;

    for (const batch of ready) {
      void send(batch, confirmed);
    }
  }

  const hydration: ViewerCardHydration = {
    request(ids, options) {
      for (let start = 0; start < ids.length; start += VIEWER_CARD_STATE_MAX_IDS) {
        queue.push({ ids: ids.slice(start, start + VIEWER_CARD_STATE_MAX_IDS), eager: options?.eager ?? false });
      }

      flush();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    hydration,
    /* The sign-in state changed (Clerk loaded, or the visitor signed in or
       out): send whatever was waiting on it. */
    setAuth(next: SignInState) {
      auth = next;
      flush();
    },
  };
}

/**
 * Fills in the viewer's own card state after the fact, for cards that came
 * from the static page or from a response that couldn't see the session.
 * Requests wait in a queue until the sign-in state says whether they are
 * worth sending.
 */
export function useViewerCardHydration(): ViewerCardHydration {
  const { isConfirmed, isSignedIn } = useViewerAuth();
  const [{ hydration, setAuth }] = useState(() => createHydration({ isConfirmed, isSignedIn }));

  useEffect(() => {
    setAuth({ isConfirmed, isSignedIn });
  }, [isConfirmed, isSignedIn, setAuth]);

  return hydration;
}
