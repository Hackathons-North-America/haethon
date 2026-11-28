"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

import { HackathonStatusTracker } from "@/components/hackathon-status-tracker";
import { HackathonVoteControl } from "@/components/hackathon-vote-control";
import { useViewerCardHydration } from "@/components/use-viewer-card-hydration";
import { useViewerAuth } from "@/components/viewer-auth";
import type { ViewerCardState } from "@/lib/hackathons/viewer-card-state";
import type { HackathonVoteState } from "@/lib/hackathons/vote-state";

/* The full /hackathons/[slug] page is static and the same for everyone, so it
   carries no viewer. A signed-in browser asks /api/hackathons/card-state for
   this hackathon (the request the catalog uses for its cards) and the vote
   control and tracker below pick the answer up. The side panel still renders
   its viewer on the server and does not use this. */
const ViewerStateContext = createContext<ViewerCardState | null>(null);

export function DetailViewerStateProvider({ children, hackathonId }: { children: ReactNode; hackathonId: string }) {
  const hydration = useViewerCardHydration();
  const [state, setState] = useState<ViewerCardState | null>(null);

  useEffect(() => {
    const unsubscribe = hydration.subscribe((states, signedIn) => {
      const next = states[hackathonId];

      // A signed-out answer carries no viewer: the controls keep waiting.
      if (signedIn && next) {
        setState(next);
      }
    });

    hydration.request([hackathonId], { eager: true });

    return unsubscribe;
  }, [hydration, hackathonId]);

  return <ViewerStateContext.Provider value={state}>{children}</ViewerStateContext.Provider>;
}

/* Starts from the page's public totals and switches to the viewer's live
   totals and own vote once they arrive. Remounted on that switch, like the
   catalog cards, because the control only reads its initial state once.
   Inert until the browser knows who is looking: a signed-in click before the
   viewer's own vote arrives would act on the wrong vote. Once Clerk confirms
   a signed-out visitor, clicks are live (they open the sign-in dialog). */
export function DetailVoteControl({
  publicVotes,
  ...props
}: Omit<React.ComponentProps<typeof HackathonVoteControl>, "initialState" | "preview"> & {
  publicVotes: HackathonVoteState;
}) {
  const { isConfirmed, isSignedIn } = useViewerAuth();
  const viewer = useContext(ViewerStateContext);
  const state = viewer
    ? { upvotes: viewer.upvotes, downvotes: viewer.downvotes, viewerVote: viewer.viewerVote }
    : publicVotes;

  return (
    <HackathonVoteControl
      initialState={state}
      key={`${state.upvotes}:${state.downvotes}:${state.viewerVote ?? 0}`}
      preview={!viewer && !(isConfirmed && isSignedIn === false)}
      {...props}
    />
  );
}

export function SignInToTrackLink() {
  return (
    <Link
      className="inline-flex min-h-10 items-center justify-center rounded-full px-5 text-sm font-medium text-ink transition-colors hover:bg-pine hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
      href="/sign-in"
    >
      Sign in to track this hackathon
    </Link>
  );
}

/* The tracker once the signed-in viewer's stage has arrived (a click before
   that could overwrite a stage it doesn't show, such as attended or won), the
   sign-in link for a signed-out viewer, and an empty row of the same height
   until then. */
export function DetailStatusTracker({ hackathonId, hackathonName }: { hackathonId: string; hackathonName: string }) {
  const { isSignedIn } = useViewerAuth();
  const viewer = useContext(ViewerStateContext);

  if (viewer) {
    return (
      <HackathonStatusTracker hackathonId={hackathonId} hackathonName={hackathonName} initialStatus={viewer.trackedStatus} />
    );
  }

  if (isSignedIn === false) {
    return <SignInToTrackLink />;
  }

  return <div aria-hidden="true" className="min-h-10" />;
}
