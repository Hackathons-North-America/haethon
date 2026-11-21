import { HeroSplit } from "@/components/hero-split";
import { HackathonMarquee } from "@/components/hackathon-marquee";

import {
  LazyApprovalFlow,
  LazyCommunityDiscord,
  LazySearchShowcase,
  LazySourcedEverywhere,
} from "@/components/landing-lazy-visuals";
import { PrimaryNav } from "@/components/primary-nav";
import { SiteFooter } from "@/components/site-footer";

/* Titles on the coverage pillars, a notch under the section head. */
const bentoTitleClassName =
  "text-xl font-medium leading-tight tracking-[-0.03em] text-ink sm:text-2xl";

const bentoBodyClassName =
  "mt-2 max-w-[30rem] text-[0.95rem] leading-relaxed text-ink/60";

/* Universal vertical rhythm for every landing section below the hero — one
   generous band of padding per section (2.33×/2.25× the old py-12/sm:py-16),
   so whitespace alone separates them. */
const sectionPaddingClassName = "px-6 py-32 sm:px-10 sm:py-40";

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
              <div className={`relative ${sectionPaddingClassName}`}>
                {/* Match the two product-story sections below: scale the
                    complete composition as one unit while the shared outer
                    padding remains unchanged. */}
                <div className="mx-auto w-[85%] [zoom:0.85]">
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
            </div>
          </section>

          <section aria-labelledby="search-showcase-heading">
            <div className="relative overflow-hidden">
              <div className={`relative ${sectionPaddingClassName}`}>
                {/* A true miniature of the section: w-[85%] under zoom 0.85
                    makes the inner layout compute at the original full width
                    (identical proportions), then render at 85% size, centered,
                    with the freed space joining the padding around it. */}
                <div className="mx-auto w-[85%] [zoom:0.85]">
                  <h2
                    id="search-showcase-heading"
                    className="mx-auto max-w-[59.8rem] text-center text-3xl font-medium leading-[1.02] tracking-[-0.05em] text-ink sm:text-5xl lg:text-6xl"
                  >
                    Search through the most comprehensive hackathon database
                  </h2>

                  <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-[minmax(13rem,0.48fr)_minmax(0,1.52fr)] lg:items-center lg:gap-16">
                    <div className="max-w-[19rem]">
                      <p className="text-xl font-medium leading-snug tracking-[-0.035em] text-ink sm:text-2xl">
                        Search hackathons by the details that matter to find
                        the one you actually want to attend.
                      </p>

                      <div className="mt-12">
                        <p className="text-sm text-ink/50">Features</p>
                        <ul className="mt-3 space-y-2 text-base font-medium leading-snug text-ink">
                          <li>Location</li>
                          <li>Name</li>
                          <li>Travel reimbursement</li>
                          <li>Near me</li>
                          <li>Date</li>
                        </ul>
                      </div>
                    </div>

                    <LazySearchShowcase />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
