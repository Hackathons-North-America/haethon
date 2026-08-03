"use client";

import dynamic from "next/dynamic";

import { LazyMount } from "@/components/lazy-mount";

/* Below-fold landing visuals. Each is split into its own chunk (next/dynamic,
   no SSR) and only mounted once scrolled near the viewport via LazyMount.
   Placeholder sizing approximates each visual's rendered height to avoid
   layout shift. */
const SourcedEverywhereVisual = dynamic(
  () =>
    import("@/components/landing-coverage-bento").then(
      (mod) => mod.SourcedEverywhereVisual,
    ),
  { ssr: false },
);

const CommunityDiscordVisual = dynamic(
  () =>
    import("@/components/landing-coverage-bento").then(
      (mod) => mod.CommunityDiscordVisual,
    ),
  { ssr: false },
);

const ApprovalFlowVisual = dynamic(
  () =>
    import("@/components/landing-coverage-bento").then(
      (mod) => mod.ApprovalFlowVisual,
    ),
  { ssr: false },
);

const PipelineSpotlightVisual = dynamic(
  () =>
    import("@/components/landing-pipeline-spotlight").then(
      (mod) => mod.PipelineSpotlightVisual,
    ),
  { ssr: false },
);

/* The bento cards size their own visual wells (relative, min-height), so the
   first two wrappers just fill whatever well they're dropped into. */
export function LazySourcedEverywhere() {
  return (
    <LazyMount className="absolute inset-0">
      <SourcedEverywhereVisual />
    </LazyMount>
  );
}

export function LazyCommunityDiscord() {
  return (
    <LazyMount className="absolute inset-0">
      <CommunityDiscordVisual />
    </LazyMount>
  );
}

export function LazyApprovalFlow() {
  return (
    <LazyMount className="min-h-[11rem]">
      <ApprovalFlowVisual />
    </LazyMount>
  );
}

export function LazyPipelineSpotlight() {
  return (
    /* Mobile shows just the spotlight card; md+ adds the backdrop board. */
    <LazyMount className="min-h-[30rem] md:min-h-[36rem]">
      <PipelineSpotlightVisual />
    </LazyMount>
  );
}
