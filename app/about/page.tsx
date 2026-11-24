import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";

import { LandingNav } from "@/components/landing/landing-nav";

export const metadata: Metadata = {
  title: "About · Hackathons North America",
  description: "Why we built Hackathons North America.",
};

/* The measuring-tape frame: a dashed rule with a tick every 40px (plus minor
   ticks every 8px on the horizontal rulers). Drawn entirely with background
   gradients so it stretches to any height without extra DOM. */
const rule = "color-mix(in oklab, var(--ink) 20%, transparent)";
const dashed = (direction: "right" | "bottom") =>
  `repeating-linear-gradient(to ${direction}, ${rule} 0 2px, transparent 2px 5px)`;
const tick = (direction: "right" | "bottom") => `linear-gradient(to ${direction}, ${rule} 0 1px, transparent 1px)`;

function rail(side: "left" | "right"): CSSProperties {
  return {
    backgroundImage: `${dashed("bottom")}, ${tick("bottom")}`,
    backgroundPosition: `${side} top, ${side} top`,
    backgroundRepeat: "no-repeat, repeat-y",
    backgroundSize: "1px 100%, 7px 40px",
  };
}

function ruler(edge: "top" | "bottom"): CSSProperties {
  return {
    backgroundImage: `${dashed("right")}, ${tick("right")}, ${tick("right")}`,
    backgroundPosition: `left ${edge}, left ${edge}, left ${edge}`,
    backgroundRepeat: "no-repeat, repeat-x, repeat-x",
    backgroundSize: "100% 1px, 40px 7px, 8px 3px",
  };
}

/* The organizing team at Hack Canada 2026. The frame matches the photo's 4:3
   so nothing is cropped, including the camera's date stamp. */
function HackCanadaFigure() {
  return (
    <figure className="my-14 sm:my-16">
      <div className="border border-dashed border-ink/15 p-1.5">
        <div className="relative aspect-[4/3] overflow-hidden border border-ink/15 bg-ink/[0.03]">
          <Image
            alt="The Hack Canada organizing team in matching Hack Canada shirts, posing and throwing hand signs around a reception desk"
            className="object-cover"
            fill
            sizes="(min-width: 640px) 460px, calc(100vw - 88px)"
            src="/photos/hack-canada-team.webp"
          />
        </div>
      </div>
      <figcaption className="mt-3 font-mono text-[12px] uppercase tracking-[0.12em] text-ink/45">
        The Hack Canada team · 2026
      </figcaption>
    </figure>
  );
}

export default function AboutPage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-surface text-ink">
      <LandingNav />

      <div className="px-4 pb-32 pt-10 sm:px-6 sm:pt-16">
        <article className="relative mx-auto max-w-[760px] py-4">
          <div aria-hidden="true" className="absolute inset-x-7 top-0 h-[7px]" style={ruler("top")} />
          <div aria-hidden="true" className="absolute bottom-0 inset-x-7 h-[7px]" style={ruler("bottom")} />
          <div aria-hidden="true" className="absolute inset-y-4 left-0 w-[7px]" style={rail("left")} />
          <div aria-hidden="true" className="absolute inset-y-4 right-0 w-[7px]" style={rail("right")} />

          <div className="mx-auto max-w-[540px] px-7 pb-20 pt-16 text-[16px] leading-[1.7] text-ink/65 sm:px-10 sm:pb-28 sm:pt-24 sm:text-[17px] [&_p+p]:mt-7">
            <h1 className="mb-10 text-[22px] font-medium leading-tight tracking-[-0.02em] text-ink sm:text-[24px]">
              Why We Were Invented
            </h1>

            <p>
              We were a group of people who kept running into each other at hackathons: Hack the North, Hack the South,
              Hack the Valley. Somewhere along the way we became really good friends, and we realized we all loved
              hackathons. We each had our own reasons. For some of us it was the people we met, for others it was the
              things we got to build, and for some it was simply the learning.
            </p>

            <p>
              But there is no central place to find them. There are websites, and there are memberships where a
              hackathon earns a badge once it passes an approval process, but none of those lists is complete. There are
              student hackathons, professional hackathons, everything in between, and company hackathons. They all face
              the same problem: hackathons want talent, and hackers want to find hackathons. Clearly, there&apos;s a
              perfect bridge here.
            </p>

            <p>
              Our advantage is that we have no affiliation, so we don&apos;t make you go through an approval process. We
              look at the people who have already done the due diligence of approving hackathons, and we bring them
              together into one list. We also list hackathons that haven&apos;t been approved yet. Maybe they&apos;re
              brand new but genuinely interesting, like a hackathon on a private jet. Something like that is really hard
              to get approved because of the logistics, but it&apos;s exactly the kind of thing worth knowing about.
            </p>

            <p>
              While building this, we also hosted our own hackathon, Hack Canada, and learned a tremendous amount from
              it. We had over 800 hackers in 2025. This year we&apos;re expecting even more interest, but we&apos;re
              trimming the event down to 600, and the core team has now been running it for three years.
            </p>

            <HackCanadaFigure />

            <p>
              Along the way, we&apos;ve gathered an incredible team. Among our alumni, three have gone through YC, one
              received an offer from a16z, and others have gone on to Polymarket, OpenAI, and Meta. At its core, this
              is a crack team trying to make hackathons better.
            </p>

            <p>
              Looking further ahead, AI has fundamentally changed what a hackathon looks like. It used to be about your
              idea and your execution. Now it&apos;s almost entirely about the idea, because execution is increasingly
              just prompting. There&apos;s a great quote for this:
            </p>

            <blockquote className="my-9 border-l border-ink/20 pl-5 text-[19px] leading-snug tracking-[-0.01em] text-ink sm:text-[20px]">
              &ldquo;An idiot in motion is better than a genius at rest.&rdquo;
            </blockquote>

            <p>
              That&apos;s the tension. There are people so hungry they&apos;ll work around the clock for the whole
              weekend just to ship an idea, and with AI they can build a far better product than ever before. That&apos;s
              both a good thing and a bad thing. Either way, the shift is real, and we&apos;re working out the best way
              to balance it.
            </p>
          </div>
        </article>
      </div>
    </main>
  );
}
