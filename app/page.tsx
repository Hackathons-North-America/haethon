import { HeroSplit } from "@/components/hero-split";
import { HackathonMarquee } from "@/components/hackathon-marquee";

import {
  LazyApprovalFlow,
  LazyCommunityDiscord,
  LazyPipelineSpotlight,
  LazySourcedEverywhere,
} from "@/components/landing-lazy-visuals";
import { LoginRequiredLink } from "@/components/login-required-dialog";
import { PrimaryNav } from "@/components/primary-nav";
import { HoverUnderline } from "@/components/hover-underline";
import { SiteFooter } from "@/components/site-footer";

/* Titles on the coverage pillars, a notch under the section head. */
const bentoTitleClassName =
  "text-xl font-medium leading-tight tracking-[-0.03em] text-ink sm:text-2xl";

const bentoBodyClassName =
  "mt-2 max-w-[30rem] text-[0.95rem] leading-relaxed text-ink/60";

/* The numbered section links ("1.0 Track →"), set in the card footer's voice:
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
      <PrimaryNav tone="bark" />

      <HeroSplit />

      <HackathonMarquee />

      {/* Everything below the hero is one continuous sheet, closed off by a
          single rule against the footer. Sections inside run together with no
          dividers — spacing alone separates them. */}
      <div>
        <div className="border-b border-black bg-paper">

          <section
            id="coverage"
            aria-labelledby="coverage-heading"
            className="scroll-mt-24"
          >
            <div className="relative overflow-hidden">
              <div className={`relative ${panelPaddingClassName}`}>
                {/* One running sentence, bold lead then muted continuation —
                    the whole pitch in a single breath. */}
                <h2
                  id="coverage-heading"
                  className="max-w-[46rem] text-2xl font-medium leading-[1.25] tracking-[-0.04em] sm:text-3xl lg:text-4xl"
                >
                  <span className="text-ink">
                    The entire hackathon stack.
                  </span>{" "}
                  <span className="text-ink/45">
                    The most comprehensive list of hackathons anywhere —
                    discover the ones you&apos;d never have found, track and
                    manage the ones you plan on attending, and document every
                    win across your journey.
                  </span>
                </h2>

                {/* The three coverage pillars, laid straight onto the paper —
                    no card chrome, so column gaps and the section padding do
                    the separating. Two pillars up top (2/3 + 1/3), one
                    full-width below. Each visual well is relative + clipped
                    with a min-height; the lazy visuals fill and crop to it. */}
                <div className="mt-10 grid gap-12 sm:mt-12 lg:grid-cols-3 lg:gap-x-12 lg:gap-y-16">
                  <article className="relative flex flex-col lg:col-span-2">
                    <div className="relative">
                      <h3 className={bentoTitleClassName}>
                        Sourced from everywhere
                      </h3>
                      <p className={bentoBodyClassName}>
                        We pull hackathons from Devpost, MLH, Luma, and
                        Eventbrite. If an event is announced somewhere, it
                        lands here.
                      </p>
                    </div>
                    <div className="relative mt-6 min-h-[19rem] flex-1 overflow-hidden">
                      <LazySourcedEverywhere />
                    </div>
                  </article>

                  <article className="relative flex flex-col">
                    <div className="relative">
                      <h3 className={bentoTitleClassName}>
                        Built by 5,000+ of us
                      </h3>
                      <p className={bentoBodyClassName}>
                        Our 5,000 strong community, from first time hackers to
                        seasoned organizers, can add their own hackathon with a
                        simple form.
                      </p>
                    </div>
                    <div className="relative mt-6 min-h-[16rem] flex-1 overflow-hidden">
                      <LazyCommunityDiscord />
                    </div>
                  </article>

                  <article className="relative lg:col-span-3">
                    <div className="relative grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-center lg:gap-14">
                      <div>
                        <h3 className={bentoTitleClassName}>
                          Approved by admins
                        </h3>
                        <p className={bentoBodyClassName}>
                          Every hackathon is read over and approved by an admin
                          before it&apos;s published, so a bad event never
                          slips through.
                        </p>
                      </div>
                      <LazyApprovalFlow />
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="pipeline-spotlight-heading">
            <div className="relative overflow-hidden">
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
                  <LoginRequiredLink href="/my" className={sectionLinkClassName} forcePrompt>
                    1.0
                    <span>
                      Track{" "}
                      <span aria-hidden="true" className="ml-1">
                        →
                      </span>
                    </span>
                    <HoverUnderline className="inset-x-0 bottom-1" />
                  </LoginRequiredLink>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden">
              <div className="relative px-6 py-10 sm:px-10 sm:py-14">
                <LazyPipelineSpotlight />
              </div>
            </div>
          </section>

        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
