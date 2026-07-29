import Link from "next/link";

import { HeroHeadline } from "@/components/hero-headline";
import { HeroDemo } from "@/components/hero-demo";
import { AudienceCards } from "@/components/audience-cards";
import { ShieldCheck, Rss, Users } from "lucide-react";

import {
  LazyLandingWorldMap,
  LazyPipelineSpotlight,
  LazySearchSpotlight,
} from "@/components/landing-lazy-visuals";
import { LandingReveal } from "@/components/landing-reveal";
import { LandingWash } from "@/components/landing-wash";
import { PrimaryNav } from "@/components/primary-nav";
import { HoverUnderline } from "@/components/hover-underline";

const coveragePillars = [
  {
    Icon: Rss,
    title: "Sourced from everywhere",
    body: "We pull hackathons from dev posts, LinkedIn, Luma, and MLH. If an event is announced somewhere, it lands here.",
  },
  {
    Icon: Users,
    title: "Built by 5,000+ of us",
    body: "Our 5,000 strong community, from first time hackers to seasoned organizers, can add their own hackathon with a simple form.",
  },
  {
    Icon: ShieldCheck,
    title: "Approved by admins",
    body: "Every hackathon is read over and approved by an admin before it's published, so a bad event never slips through.",
  },
];

/* The numbered section links ("1.0 Search →"), set in the card footer's voice:
   small-caps mono, muted until hovered, with the shared slide-in underline. */
const sectionLinkClassName =
  "group relative mt-8 inline-flex min-h-8 items-center gap-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink/70 transition-colors hover:text-pine focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

/* Card-body headings: the same tight tracking as the card's title line. */
const sectionHeadingClassName =
  "text-2xl font-medium leading-[1.1] tracking-[-0.045em] text-ink sm:text-3xl lg:text-4xl";

/* Shared interior padding for the sheet's text panels, so every rule-to-text
   distance matches across sections. */
const panelPaddingClassName = "px-6 py-12 sm:px-10 sm:py-16";

export default function Home() {
  // Signed-in visitors are redirected into the app by the middleware, keeping
  // this page fully static.
  return (
    <main className="min-h-screen overflow-x-clip bg-paper text-ink">
      <PrimaryNav />

      <section className="relative isolate overflow-hidden pb-16 pt-32 sm:pb-28 sm:pt-44">
        <LandingWash seed="hero-bloom" />
        <LandingWash seed="hero-bloom-right" />

        {/* Split hero: copy on the left half, the live product demo on the
            right — stacking to copy-then-demo on small screens. */}
        <div className="relative z-10 mx-auto grid max-w-[76rem] items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
          <div className="flex max-w-[36rem] flex-col items-start">
            <HeroHeadline />

            <LandingReveal delay={0.55}>
              <p className="mt-6 max-w-[30rem] text-pretty text-base leading-relaxed text-ink/60 sm:text-lg">
                Search hundreds of upcoming hackathons, build your profile, and
                never miss another application deadline.
              </p>
            </LandingReveal>

            <LandingReveal delay={0.7}>
              {/* Framed like a card's pipeline cell: black outline on paper,
                  small-caps mono, filling pine on hover. */}
              <Link
                href="/hackathons"
                className="mt-10 inline-flex min-h-12 items-center justify-center gap-2 border border-black bg-paper px-8 font-mono text-xs font-medium uppercase tracking-[0.14em] text-ink transition-colors hover:bg-pine hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine sm:min-h-14 sm:px-10 sm:text-sm"
              >
                Open App
                <span aria-hidden="true">→</span>
              </Link>
            </LandingReveal>
          </div>

          <LandingReveal className="w-full" delay={0.45}>
            <div className="mx-auto w-full max-w-[27rem] lg:max-w-[29rem]">
              <HeroDemo />
            </div>
          </LandingReveal>
        </div>
      </section>

      {/* Everything below the hero is one ruled sheet, framed in the card's
          black. Sections inside share single rules the way the card's band,
          cover, and body do — no gaps, panels glued edge to edge. */}
      <div className="pb-16 sm:pb-24">
        <div className="border-y border-black bg-paper">

          <section
            id="coverage"
            aria-labelledby="coverage-heading"
            className="scroll-mt-24"
          >
            <div className="relative overflow-hidden">
              <LandingWash seed="coverage-header" />
              <div className={`relative max-w-[36rem] ${panelPaddingClassName}`}>
                <h2 id="coverage-heading" className={sectionHeadingClassName}>
                  Hackathons across the globe
                </h2>
                <p className="mt-4 max-w-[32rem] text-base leading-relaxed text-ink/60">
                  One home for every event: sourced from across the web,
                  submitted by the community, and vetted by real people.
                </p>
              </div>
            </div>

            {/* The map sits like the card's cover image, running straight out
                of the header with no rule between them. */}
            <div className="relative overflow-hidden">
              <LandingWash seed="coverage-map" />
              <div className="relative">
                <LazyLandingWorldMap />
              </div>
            </div>

            {/* Ruled off like the card's pipeline band: one black rule between
                cells, the wash-and-grain bloom painting under all three. */}
            <div className="relative grid overflow-hidden border-t border-black sm:grid-cols-3">
              <LandingWash seed="coverage-pillars" />
              {coveragePillars.map(({ Icon, title, body }, index) => (
                <div
                  key={title}
                  className={`relative px-6 py-7 sm:px-7 sm:py-8 ${
                    index > 0 ? "border-t border-black sm:border-l sm:border-t-0" : ""
                  }`}
                >
                  <Icon
                    aria-hidden="true"
                    className="size-6 text-pine"
                    strokeWidth={1.75}
                  />
                  <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-ink">
                    {title}
                  </h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/60">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="search-spotlight-heading"
            className="border-t border-black"
          >
            <div className="relative overflow-hidden">
              <LandingWash seed="search-header" />
              <div
                className={`relative grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-20 ${panelPaddingClassName}`}
              >
                <h2
                  id="search-spotlight-heading"
                  className={`max-w-[22rem] ${sectionHeadingClassName}`}
                >
                  Find the ones worth going to
                </h2>
                <div>
                  <p className="max-w-[32rem] text-base leading-relaxed text-ink/60 sm:text-lg">
                    Search hackathons by country, filter by date and format, and
                    surface the events that reimburse your travel. Find the
                    hackathon you actually want to attend in your area, and
                    never miss a single one.
                  </p>
                  <Link href="/hackathons" className={sectionLinkClassName}>
                    1.0
                    <span>
                      Search{" "}
                      <span aria-hidden="true" className="ml-1">
                        →
                      </span>
                    </span>
                    <HoverUnderline className="inset-x-0 bottom-1" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden">
              <LandingWash seed="search-visual" />
              <div className="relative px-6 py-10 sm:px-10 sm:py-14">
                <LazySearchSpotlight />
              </div>
            </div>
          </section>

          <section
            aria-labelledby="pipeline-spotlight-heading"
            className="border-t border-black"
          >
            <div className="relative overflow-hidden">
              <LandingWash seed="pipeline-header" />
              <div
                className={`relative grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-20 ${panelPaddingClassName}`}
              >
                <h2
                  id="pipeline-spotlight-heading"
                  className={`max-w-[22rem] ${sectionHeadingClassName}`}
                >
                  Get reminders and keep track of them all
                </h2>
                <div>
                  <p className="max-w-[32rem] text-base leading-relaxed text-ink/60 sm:text-lg">
                    Choose email reminders that land a week before applications
                    open, a day before they open, and a day before the hackathon
                    starts. Then follow the status of every hackathon
                    you&apos;ve applied to (interested, applied, accepted) on
                    one board.
                  </p>
                  <Link href="/my" className={sectionLinkClassName}>
                    2.0
                    <span>
                      Track{" "}
                      <span aria-hidden="true" className="ml-1">
                        →
                      </span>
                    </span>
                    <HoverUnderline className="inset-x-0 bottom-1" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden">
              <LandingWash seed="pipeline-visual" />
              <div className="relative px-6 py-10 sm:px-10 sm:py-14">
                <LazyPipelineSpotlight />
              </div>
            </div>
          </section>

          <section
            aria-labelledby="audiences-heading"
            className="border-t border-black"
          >
            <div className="relative overflow-hidden">
              <LandingWash seed="audiences-header" />
              <div className={`relative mx-auto max-w-[30rem] text-center ${panelPaddingClassName}`}>
                {/* The card's tier-label voice: small-caps mono kicker. */}
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-pine">
                  Who it&apos;s for
                </p>
                <h2 id="audiences-heading" className={`mt-3 ${sectionHeadingClassName}`}>
                  One platform, three jobs
                </h2>
              </div>
            </div>

            <AudienceCards />
          </section>

        </div>
      </div>

    </main>
  );
}
