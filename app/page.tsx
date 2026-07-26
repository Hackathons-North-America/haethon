import Link from "next/link";

import { HeroHeadline } from "@/components/hero-headline";
import { HeroPolaroids } from "@/components/hero-polaroids";
import { AudienceCards } from "@/components/audience-cards";
import { ShieldCheck, Rss, Users } from "lucide-react";

import {
  LazyLandingWorldMap,
  LazyPipelineSpotlight,
  LazySearchSpotlight,
} from "@/components/landing-lazy-visuals";
import { LandingReveal } from "@/components/landing-reveal";
import { PolaroidFrame, mobilePolaroids } from "@/components/polaroid-frame";
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

export default function Home() {
  // Signed-in visitors are redirected into the app by the middleware, keeping
  // this page fully static.
  return (
    <main className="min-h-screen overflow-x-clip bg-paper text-ink">
      <PrimaryNav />

      <section className="relative isolate overflow-hidden pb-16 pt-36 sm:min-h-[min(110svh,980px)] sm:pb-32 sm:pt-48">
        <HeroPolaroids />

        <div className="relative z-10 mx-auto flex max-w-[640px] flex-col items-center px-5 text-center sm:px-8 lg:max-w-[700px]">
          <HeroHeadline />

          <LandingReveal delay={0.55}>
            <p className="mt-6 max-w-[34rem] text-pretty text-base leading-relaxed text-ink/55 sm:text-lg">
              Search hundreds of upcoming hackathons, build your profile, and
              never miss another application deadline.
            </p>
          </LandingReveal>

          <LandingReveal delay={0.7}>
            <Link
              href="/hackathons"
              className="group relative mt-10 inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-8 text-base font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine sm:min-h-16 sm:px-10 sm:text-lg"
            >
              Open App
              <span aria-hidden="true">→</span>
              <HoverUnderline className="inset-x-8 bottom-3 sm:inset-x-10 sm:bottom-3.5" />
            </Link>
          </LandingReveal>
        </div>

        <div className="relative z-10 mx-auto mt-14 grid max-w-[360px] grid-cols-2 gap-3 px-6 sm:hidden">
          {mobilePolaroids.map((shot, i) => (
            <PolaroidFrame
              key={`mobile-${shot.src}`}
              src={shot.src}
              alt={shot.alt}
              caption={shot.caption}
              className={`w-full ${
                [
                  "rotate-[-4deg] translate-y-1",
                  "rotate-[3deg] -translate-y-1",
                  "rotate-[4deg]",
                  "rotate-[-3deg] translate-y-1",
                ][i]
              }`}
              width={shot.width}
              height={shot.height}
              sticker={shot.sticker}
              lift={shot.lift}
              tape={shot.tape}
            />
          ))}
        </div>

      </section>

      <section
        id="coverage"
        aria-labelledby="coverage-heading"
        className="scroll-mt-24 py-16 sm:py-20"
      >
        <div className="mx-auto max-w-[1100px] px-5 sm:px-8 lg:px-12">
          <div className="max-w-[36rem]">
            <h2
              id="coverage-heading"
              className="text-2xl font-medium leading-[1.15] tracking-tight text-ink sm:text-3xl lg:text-4xl"
            >
              Hackathons across the globe
            </h2>
            <p className="mt-4 max-w-[32rem] text-base leading-relaxed text-ink/55">
              One home for every event: sourced from across the web, submitted
              by the community, and vetted by real people.
            </p>
          </div>
        </div>

        {/* Full-bleed: the map breaks out of the content column to span the
            entire page width, edge to edge. */}
        <div className="mt-10 w-full sm:mt-12">
          <LazyLandingWorldMap />
        </div>

        <div className="mx-auto max-w-[1100px] px-5 sm:px-8 lg:px-12">
          <div className="mt-10 grid divide-y divide-ink/10 border-t border-ink/10 sm:mt-12 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {coveragePillars.map(({ Icon, title, body }) => (
              <div key={title} className="px-1 py-7 sm:px-7 sm:py-8">
                <Icon
                  aria-hidden="true"
                  className="size-6 text-pine"
                  strokeWidth={1.75}
                />
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-ink">
                  {title}
                </h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/55">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="search-spotlight-heading"
        className="px-5 py-16 sm:px-8 sm:py-20 lg:px-12"
      >
        <div className="mx-auto max-w-[1100px]">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
            <h2
              id="search-spotlight-heading"
              className="max-w-[22rem] text-2xl font-medium leading-[1.15] tracking-tight text-ink sm:text-3xl lg:text-4xl"
            >
              Find the ones worth going to
            </h2>
            <div>
              <p className="max-w-[32rem] text-base leading-relaxed text-ink/55 sm:text-lg">
                Search hackathons by country, filter by date and format, and
                surface the events that reimburse your travel. Find the
                hackathon you actually want to attend in your area, and never
                miss a single one.
              </p>
              <Link
                href="/hackathons"
                className="group relative mt-8 -ml-4 inline-flex items-center gap-3 rounded-full py-2 pl-4 pr-5 font-mono text-sm text-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
              >
                1.0
                <span>
                  Search{" "}
                  <span aria-hidden="true" className="ml-1">
                    →
                  </span>
                </span>
                <HoverUnderline className="bottom-1 left-4 right-5" />
              </Link>
            </div>
          </div>

          <div className="mt-14 sm:mt-16 lg:mt-20">
            <LazySearchSpotlight />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="pipeline-spotlight-heading"
        className="px-5 py-16 sm:px-8 sm:py-20 lg:px-12"
      >
        <div className="mx-auto max-w-[1100px]">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
            <h2
              id="pipeline-spotlight-heading"
              className="max-w-[22rem] text-2xl font-medium leading-[1.15] tracking-tight text-ink sm:text-3xl lg:text-4xl"
            >
              Get reminders and keep track of them all
            </h2>
            <div>
              <p className="max-w-[32rem] text-base leading-relaxed text-ink/55 sm:text-lg">
                Choose email reminders that land a week before applications
                open, a day before they open, and a day before the hackathon
                starts. Then follow the status of every hackathon you&apos;ve
                applied to (interested, applied, accepted) on one board.
              </p>
              <Link
                href="/my"
                className="group relative mt-8 -ml-4 inline-flex items-center gap-3 rounded-full py-2 pl-4 pr-5 font-mono text-sm text-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
              >
                2.0
                <span>
                  Track{" "}
                  <span aria-hidden="true" className="ml-1">
                    →
                  </span>
                </span>
                <HoverUnderline className="bottom-1 left-4 right-5" />
              </Link>
            </div>
          </div>

          <div className="mt-14 sm:mt-16 lg:mt-20">
            <LazyPipelineSpotlight />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="audiences-heading"
        className="px-5 py-16 sm:px-8 sm:py-20 lg:px-12"
      >
        <div className="mx-auto max-w-[1100px]">
          <div className="mx-auto max-w-[26rem] text-center">
            <p className="text-[0.7rem] font-medium tracking-[0.04em] text-pine">
              Who it&apos;s for
            </p>
            <h2
              id="audiences-heading"
              className="mt-3 text-2xl font-medium leading-[1.15] tracking-tight text-ink sm:text-3xl lg:text-4xl"
            >
              One platform, three jobs
            </h2>
          </div>

          <AudienceCards />
        </div>
      </section>

    </main>
  );
}
