import Link from "next/link";
import type { CSSProperties } from "react";

import { HeroDemo } from "@/components/hero-demo";
import { HeroHeadline } from "@/components/hero-headline";
import { LandingReveal } from "@/components/landing-reveal";

/* The landing hero, split like a magazine spread: copy on a finely grained
   espresso panel at left — the Federato reference's ground, with its green
   swapped for the site's pine on the CTA — and at right a plain paper field
   carrying the stepped product demo: the Track/Reminders/Face-off pills up
   top and the animated scene beneath them. Moss hairlines rule off the
   panels the way the reference's drafting lines do. */

/* The hackathon cards' streak grain, verbatim (see `STREAK_NOISE_URI` in
   hackathon-card.tsx): desaturated feTurbulence pushed to near-binary contrast
   so the speckle survives overlay-blending, tiled at its natural 140px. Shared
   so the hero's mesh reads as the same material as the cards' tier washes
   rather than a separate texture. */
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='3' intercept='-1'/%3E%3CfeFuncG type='linear' slope='3' intercept='-1'/%3E%3CfeFuncB type='linear' slope='3' intercept='-1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* The panel's shadow, built on the hackathon cards' airbrushed-streak recipe
   (see `getTierStreak`): a broad ellipse whose centre sits off-canvas, drawn
   twice — a faint outer shoulder over a deeper core — so the darkness rolls
   off in stages and dissolves into the ground instead of ending on a ring.
   The card seeds these positions per name; the panel is a single fixed
   composition, so the geometry is written out rather than generated. */
const SHADOW_CORE = "ellipse 58% 74% at 104% 30%";
const SHADOW_SHOULDER = "ellipse 62% 79% at 104% 30%";

/* Tonal pools over the espresso ground: the black bloom sweeping in from the
   panel's inner edge on top, warm light gathering high and shadow sinking to
   the foot beneath it. Earlier layers paint over later ones. */
const BARK_BLOOMS = [
  `radial-gradient(${SHADOW_SHOULDER}, transparent 46%, rgb(0 0 0 / 0.2) 52%, rgb(0 0 0 / 0.08) 61%, transparent 72%)`,
  `radial-gradient(${SHADOW_CORE}, rgb(0 0 0 / 0.46) 0%, rgb(0 0 0 / 0.44) 40%, rgb(0 0 0 / 0.28) 53%, rgb(0 0 0 / 0.1) 65%, transparent 76%)`,
  "radial-gradient(50% 58% at 18% 14%, rgb(80 55 36 / 0.5), transparent 72%)",
  "radial-gradient(44% 50% at 86% 18%, rgb(66 44 29 / 0.4), transparent 70%)",
  "radial-gradient(46% 52% at 8% 82%, rgb(58 39 26 / 0.35), transparent 70%)",
  "radial-gradient(62% 46% at 52% 104%, rgb(24 15 10 / 0.55), transparent 76%)",
].join(", ");

export function HeroSplit() {
  return (
    <section className="relative grid overflow-hidden bg-bark lg:min-h-svh lg:grid-cols-2">
      {/* ————— Left: copy on the grained espresso panel. ————— */}
      {/* The reference's top inset is 11.02vw, but that only clears the fold
          because its copy block is shorter than ours. These are minimums: with
          the block now short enough to fit, justify-center takes over and the
          copy sits centred in the panel with room under the CTA. */}
      <div className="relative flex flex-col justify-center overflow-hidden px-6 pb-20 pt-36 sm:px-12 lg:px-0 lg:pb-16 lg:pt-[7vw]">
        {/* Tonal blooms, then the grain riding over them — the same single
            overlay-blended speckle layer the cards put over their tier wash,
            with no low-frequency mottle beneath it: the blooms alone carry the
            large-scale variation, so the surface reads as sand rather than
            leather. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ backgroundImage: BARK_BLOOMS }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-70 mix-blend-overlay"
          style={
            {
              backgroundImage: GRAIN_URI,
              backgroundSize: "140px 140px",
            } as CSSProperties
          }
        />

        {/* Drafting line at the panel's edge, as in the reference — ruled in
            cream rather than the reference's coral, at the same strength as
            the nav's underline so the hairlines read as one weight. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-7 hidden w-px bg-paper/60 lg:block xl:left-12"
        />

        {/* The copy column, measured off the reference: it sits 11.12vw in
            from the panel's left edge (142px at a 1280 viewport) and runs
            33vw wide, left-aligned rather than centered — the reference gives
            the left margin more room than the right. Below lg the panel keeps
            its own padding and the column just centers. */}
        <div className="relative mx-auto w-full max-w-[34rem] lg:mx-0 lg:ml-[11.12vw] lg:w-[33vw] lg:max-w-none">
          <HeroHeadline />

          <LandingReveal delay={0.55}>
            {/* Reference metrics: 1.495vw (19.1px at 1280), 1.3 leading, light
                weight, same cream as the headline, and a 3.68vw (47px) gap up
                to it. The paragraph runs the full column width. */}
            <p className="mt-[clamp(1.75rem,3.68vw,3.5rem)] text-[clamp(1.0625rem,1.62vw,1.75rem)] font-light leading-[1.3] text-paper">
              The most comprehensive hackathon list anywhere — follow your
              applications on one board, with email reminders so you never
              miss a deadline.
            </p>
          </LandingReveal>

          <LandingReveal delay={0.7}>
            {/* The reference's filled CTA, reversed to cream with a black
                frame — matching the nav pill. The reference sets a 1.84vw
                (23.5px) gap under the paragraph. */}
            <Link
              href="/hackathons"
              className="mt-6 inline-flex items-center justify-center rounded-md border border-black bg-paper px-7 py-3.5 text-[15px] font-medium text-ink transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
            >
              Open App
            </Link>
          </LandingReveal>
        </div>
      </div>

      {/* ————— Right: the stepped product demo — the step pills across the
          top, Federato-style, with the animated scene playing out beneath
          whichever pill is lit. ————— */}
      {/* The top inset only exists at lg, where the panel's top edge sits
          under the fixed nav; stacked below lg the demo starts flush against
          the copy panel. */}
      <div className="relative flex min-h-[40rem] flex-col overflow-hidden bg-paper sm:min-h-[46rem] lg:min-h-full lg:border-l lg:border-moss lg:pt-[4.25rem]">
        <LandingReveal className="flex w-full flex-1 flex-col" delay={0.45}>
          <HeroDemo />
        </LandingReveal>
      </div>
    </section>
  );
}
