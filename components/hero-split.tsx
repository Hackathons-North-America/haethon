import Link from "next/link";
import type { CSSProperties } from "react";

import { HeroDemo } from "@/components/hero-demo";
import { HeroHeadline } from "@/components/hero-headline";
import { LandingReveal } from "@/components/landing-reveal";

/* The landing hero, split like a magazine spread: copy on a grained pine
   panel at left — the site's own accent green, treated with the same
   wash-and-grain airbrushing as the hackathon cards — and at right a plain
   paper field where a corner of the app itself pokes in: a browser window
   cropped by the viewport's right and bottom edges, holding the giant
   animated card. */

/* Fine speckle: high-contrast desaturated turbulence, tiled small — the same
   grain recipe the cards ride over their tier streaks. */
const GRAIN_FINE_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='3' intercept='-1'/%3E%3CfeFuncG type='linear' slope='3' intercept='-1'/%3E%3CfeFuncB type='linear' slope='3' intercept='-1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* Coarse mottle: low-frequency turbulence tiled large, for the cloudy
   light-and-shadow drift under the speckle. */
const GRAIN_COARSE_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.045' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='320' height='320' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* Tonal pools over the pine ground — moss light gathering at the corners and
   deeper pine shadow pulling away from it, soft-edged like the cards'
   airbrushed streaks. */
const PINE_BLOOMS = [
  "radial-gradient(48% 55% at 14% 16%, rgb(0 160 113 / 0.34), transparent 72%)",
  "radial-gradient(40% 50% at 88% 8%, rgb(0 138 98 / 0.28), transparent 70%)",
  "radial-gradient(55% 48% at 70% 72%, rgb(0 84 61 / 0.5), transparent 75%)",
  "radial-gradient(42% 55% at 4% 86%, rgb(0 150 106 / 0.24), transparent 70%)",
  "radial-gradient(60% 40% at 45% 105%, rgb(0 62 46 / 0.55), transparent 76%)",
].join(", ");

export function HeroSplit() {
  return (
    <section className="relative grid overflow-hidden bg-pine lg:min-h-svh lg:grid-cols-2">
      {/* ————— Left: copy on grained pine. ————— */}
      <div className="relative flex flex-col justify-center overflow-hidden px-6 pb-20 pt-36 sm:px-12 lg:py-40 lg:pl-16 xl:pl-24">
        {/* Tonal blooms, then the two-scale grain riding over them. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ backgroundImage: PINE_BLOOMS }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-50 mix-blend-soft-light"
          style={
            {
              backgroundImage: GRAIN_COARSE_URI,
              backgroundSize: "320px 320px",
            } as CSSProperties
          }
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-45 mix-blend-overlay"
          style={{ backgroundImage: GRAIN_FINE_URI } as CSSProperties}
        />

        {/* Hairline rule, echoing the reference layout's drafting lines. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-7 hidden w-px bg-paper/25 lg:block xl:left-12"
        />

        <div className="relative max-w-[34rem]">
          <HeroHeadline />

          <LandingReveal delay={0.55}>
            <p className="mt-8 max-w-[28rem] text-pretty text-base leading-relaxed text-paper/75 sm:text-lg">
              Search hundreds of upcoming hackathons, build your profile, and
              never miss another application deadline.
            </p>
          </LandingReveal>

          <LandingReveal delay={0.7}>
            {/* No pill: the card-cell CTA voice, outlined in paper on the
                pine ground and filling solid on hover. */}
            <Link
              href="/hackathons"
              className="mt-10 inline-flex min-h-13 items-center justify-center gap-2 border border-paper/85 px-8 font-mono text-xs font-medium uppercase tracking-[0.14em] text-paper transition-colors hover:bg-paper hover:text-pine focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper sm:text-sm"
            >
              Open App
              <span aria-hidden="true">→</span>
            </Link>
          </LandingReveal>
        </div>
      </div>

      {/* ————— Right: plain paper, with a corner of the app itself. The
          browser frame runs flush off the right and bottom edges, so only its
          top-left corner shows — as if the real site were peeking into the
          page — with the giant animated card inside. ————— */}
      <div className="relative flex min-h-[40rem] flex-col overflow-hidden bg-paper pl-6 pt-28 sm:min-h-[46rem] sm:pl-10 lg:min-h-full lg:pl-14 lg:pt-36">
        <LandingReveal className="flex w-full flex-1 flex-col" delay={0.45}>
          <HeroDemo />
        </LandingReveal>
      </div>
    </section>
  );
}
