import Image from "next/image";
import Link from "next/link";

import { HeroAurora } from "@/components/hero-inuksuk";
import { HeroTypewriterSpan } from "@/components/hero-typewriter-span";
import {
  DiscoverVisual,
  ProfileVisual,
  RemindersVisual,
} from "@/components/landing-feature-visuals";
import { LandingMap } from "@/components/landing-map";
import { LandingReveal } from "@/components/landing-reveal";
import { PolaroidFrame, heroPolaroids, mobilePolaroids } from "@/components/polaroid-frame";
import { PrimaryNav } from "@/components/primary-nav";

const features = [
  {
    id: "discover",
    eyebrow: "Discover",
    heading: "Every hackathon in one place",
    body: "Search hundreds of events across North America by name, city, date, and format — including beginner-friendly and travel-reimbursed options.",
    Visual: DiscoverVisual,
  },
  {
    id: "reminders",
    eyebrow: "Reminders",
    heading: "Deadlines that find you",
    body: "Get email alerts when applications open or close, decisions land, and check-in starts — so you never scramble at the last minute.",
    Visual: RemindersVisual,
  },
  {
    id: "profile",
    eyebrow: "Profile",
    heading: "A record of what you shipped",
    body: "Track your pipeline, verify attendance, pin wins, and build an activity history that shows where you've been and what you've built.",
    Visual: ProfileVisual,
  },
] as const;

const audiences = [
  {
    label: "Hackers",
    title: "Find and follow events",
    body: "Discover hackathons, save the ones you care about, and keep every deadline in one feed.",
  },
  {
    label: "Organizers",
    title: "Publish and grow",
    body: "List your event to reach more builders, and tap HNA's network for advice and reach.",
  },
  {
    label: "Hosts",
    title: "Run it with us",
    body: "Partner with HNA to host end to end — or use our playbooks to run your own.",
  },
];

const faqs = [
  {
    question: "What is Hackathons North America?",
    answer:
      "HNA is a discovery and tracking layer for hackathons across North America — plus organizer support and a flagship event ecosystem.",
  },
  {
    question: "Is it free to use?",
    answer:
      "Yes. Searching, saving events, and tracking your pipeline are free for hackers.",
  },
  {
    question: "How do reminders work?",
    answer:
      "Save a hackathon and choose which milestones you care about. We will email you when applications open, close, decisions go out, or check-in begins.",
  },
  {
    question: "Can I list my hackathon?",
    answer:
      "Organizers can submit events for review. Once published, they appear in search and can reach hackers across the HNA network.",
  },
];

const surfaceCard =
  "rounded-[1.75rem] border border-navy/10 bg-navy/[0.03] p-6 sm:rounded-[2rem] sm:p-8 lg:p-10 dark:border-white/10 dark:bg-white/[0.04]";

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-clip bg-page text-ink">
      <PrimaryNav />

      <section className="relative isolate min-h-[min(110svh,980px)] overflow-hidden pb-28 pt-28 sm:pb-32 sm:pt-32">
        <HeroAurora />

        {heroPolaroids.map((shot) => (
          <PolaroidFrame
            key={shot.src}
            src={shot.src}
            alt={shot.alt}
            caption={shot.caption}
            className={shot.className}
            width={shot.width}
            height={shot.height}
            sticker={shot.sticker}
            lift={shot.lift}
          />
        ))}

        <div className="relative z-10 mx-auto flex max-w-[640px] flex-col items-center px-5 text-center sm:px-8 lg:max-w-[700px]">
          <LandingReveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-navy/10 bg-navy/[0.03] px-3.5 py-1.5 text-[0.75rem] font-medium text-navy/65 dark:border-white/10 dark:bg-white/5 dark:text-wheat/70">
              <span aria-hidden="true">✦</span>
              Across Canada &amp; the US
            </p>
          </LandingReveal>

          <LandingReveal delay={0.08}>
            <h1 className="mt-7 font-serif text-[clamp(2.75rem,8vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-navy dark:text-wheat">
              Where{" "}
              <span className="bg-gradient-to-r from-boreal via-[#5a9e8a] to-cabernet bg-clip-text text-transparent">
                hackers
              </span>{" "}
              find their next weekend.
            </h1>
          </LandingReveal>

          <LandingReveal delay={0.14}>
            <p
              aria-label="Search hundreds of upcoming hackathons, build your profile, and never miss another application deadline."
              className="mt-6 max-w-[34rem] text-base leading-relaxed text-navy/60 sm:text-lg dark:text-wheat/65"
            >
              Search hundreds of upcoming hackathons, build your profile, and{" "}
              <HeroTypewriterSpan className="text-rust" />
            </p>
          </LandingReveal>

          <LandingReveal delay={0.2}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/hackathons"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-cabernet px-6 text-sm font-semibold text-wheat transition-colors hover:bg-[#5c151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cabernet dark:bg-wheat dark:text-[#141414] dark:hover:bg-white dark:focus-visible:outline-wheat"
              >
                Open App
              </Link>
              <Link
                href="/about"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-navy/15 bg-white/70 px-6 text-sm font-semibold text-navy transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-navy/30 dark:border-white/15 dark:bg-white/5 dark:text-wheat dark:hover:bg-white/10 dark:focus-visible:outline-wheat"
              >
                About HNA
              </Link>
            </div>
            <p className="mt-4 text-[0.75rem] text-navy/40 dark:text-wheat/40">
              Free for hackers. Built for North America.
            </p>
          </LandingReveal>
        </div>

        <div className="relative z-10 mx-auto mt-12 grid max-w-[360px] grid-cols-2 gap-2 sm:mt-14 sm:hidden">
          {mobilePolaroids.map((shot, i) => (
            <PolaroidFrame
              key={`mobile-${shot.src}`}
              src={shot.src}
              alt={shot.alt}
              caption={shot.caption}
              className={`w-full ${
                [
                  "rotate-[-8deg] translate-y-1",
                  "rotate-[7deg] -translate-y-2",
                  "rotate-[10deg] -translate-x-1",
                  "rotate-[-6deg] translate-y-2",
                ][i]
              }`}
              width={shot.width}
              height={shot.height}
              sticker={shot.sticker}
              lift={shot.lift}
            />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="map-heading"
        className="px-5 py-16 sm:px-8 sm:py-20 lg:px-12"
      >
        <div className="mx-auto max-w-[1100px]">
          <div className={surfaceCard}>
            <div className="max-w-[34rem]">
              <p className="text-[0.7rem] font-medium tracking-[0.04em] text-rust">
                Coverage
              </p>
              <h2
                id="map-heading"
                className="mt-3 font-serif text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-navy sm:text-3xl lg:text-4xl dark:text-wheat"
              >
                From coast to coast, every weekend that matters
              </h2>
              <p className="mt-4 text-base leading-relaxed text-navy/55 dark:text-wheat/55">
                Live routes across the cities where hackers actually build —
                Toronto to the Bay, Montreal to Vancouver, Austin to Chicago.
              </p>
            </div>

            <div className="mt-8 overflow-hidden rounded-2xl border border-navy/10 bg-white dark:border-white/10">
              <LandingMap />
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="features-heading"
        className="px-5 py-16 sm:px-8 sm:py-20 lg:px-12"
      >
        <div className="mx-auto max-w-[1100px]">
          <div className="mx-auto max-w-[28rem] text-center">
            <p className="text-[0.7rem] font-medium tracking-[0.04em] text-rust">
              Product
            </p>
            <h2
              id="features-heading"
              className="mt-3 font-serif text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-navy sm:text-3xl lg:text-4xl dark:text-wheat"
            >
              Built for the full hackathon cycle
            </h2>
          </div>

          <div className="mt-12 space-y-5 sm:mt-14 sm:space-y-6">
            {features.map((feature, index) => {
              const Visual = feature.Visual;
              const mirrored = index % 2 === 1;

              return (
                <div
                  key={feature.id}
                  className="grid items-center gap-8 rounded-[1.75rem] border border-navy/10 bg-navy/[0.03] p-5 sm:rounded-[2rem] sm:p-7 lg:grid-cols-2 lg:gap-12 lg:p-8 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <div className={mirrored ? "lg:order-2" : undefined}>
                    <p className="text-[0.7rem] font-medium tracking-[0.04em] text-rust">
                      {feature.eyebrow}
                    </p>
                    <h3 className="mt-3 text-xl font-semibold leading-[1.2] tracking-[-0.02em] text-navy sm:text-2xl dark:text-wheat">
                      {feature.heading}
                    </h3>
                    <p className="mt-3 max-w-[30rem] text-base leading-relaxed text-navy/55 dark:text-wheat/55">
                      {feature.body}
                    </p>
                  </div>

                  <div
                    className={`overflow-hidden rounded-2xl border border-navy/10 dark:border-white/10 ${
                      mirrored ? "lg:order-1" : ""
                    }`}
                  >
                    <Visual />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="audiences-heading"
        className="px-5 py-16 sm:px-8 sm:py-20 lg:px-12"
      >
        <div className="mx-auto max-w-[1100px]">
          <div className="mx-auto max-w-[26rem] text-center">
            <p className="text-[0.7rem] font-medium tracking-[0.04em] text-rust">
              Who it&apos;s for
            </p>
            <h2
              id="audiences-heading"
              className="mt-3 font-serif text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-navy sm:text-3xl lg:text-4xl dark:text-wheat"
            >
              One platform, three jobs
            </h2>
          </div>

          <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3 sm:gap-5">
            {audiences.map((audience, i) => (
              <div
                key={audience.label}
                className={`rounded-[1.5rem] border border-navy/10 bg-navy/[0.03] p-6 sm:rounded-[1.75rem] sm:p-7 dark:border-white/10 dark:bg-white/[0.04] ${
                  i === 1 ? "sm:-rotate-1" : i === 2 ? "sm:rotate-1" : ""
                }`}
              >
                <p className="text-[0.7rem] font-medium tracking-[0.04em] text-rust">
                  {audience.label}
                </p>
                <h3 className="mt-3 text-lg font-semibold tracking-tight text-navy sm:text-xl dark:text-wheat">
                  {audience.title}
                </h3>
                <p className="mt-2.5 text-[0.95rem] leading-relaxed text-navy/55 dark:text-wheat/55">
                  {audience.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="fqa"
        aria-labelledby="faq-heading"
        className="px-5 py-16 sm:px-8 sm:py-20 lg:px-12"
      >
        <div className="mx-auto max-w-[1100px]">
          <div className={`${surfaceCard} lg:p-10`}>
            <div className="max-w-[32rem]">
              <p className="text-[0.7rem] font-medium tracking-[0.04em] text-rust">
                FAQ
              </p>
              <h2
                id="faq-heading"
                className="mt-3 font-serif text-2xl font-semibold leading-[1.15] tracking-[-0.02em] text-navy sm:text-3xl dark:text-wheat"
              >
                Questions, answered
              </h2>
            </div>

            <dl className="mt-8 space-y-0 sm:mt-10">
              {faqs.map((faq) => (
                <div
                  key={faq.question}
                  className="grid gap-2 border-t border-navy/10 py-6 sm:grid-cols-[minmax(0,20rem)_1fr] sm:gap-12 sm:py-7 dark:border-white/10"
                >
                  <dt className="text-base font-semibold tracking-tight text-navy dark:text-wheat">
                    {faq.question}
                  </dt>
                  <dd className="max-w-[34rem] text-[0.95rem] leading-relaxed text-navy/55 dark:text-wheat/55">
                    {faq.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 pt-4 sm:px-8 sm:pb-20 lg:px-12">
        <div className="mx-auto max-w-[1100px]">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-cabernet/20 bg-cabernet px-6 py-12 text-center text-wheat sm:rounded-[2rem] sm:px-10 sm:py-14">
            <Image
              src="/logo-beaver.png"
              alt=""
              aria-hidden="true"
              width={90}
              height={80}
              className="pointer-events-none absolute left-6 top-6 hidden w-14 rotate-[-8deg] opacity-90 sm:block"
            />
            <h2 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              Ready to find your next hackathon?
            </h2>
            <p className="mx-auto mt-4 max-w-[28rem] text-base leading-relaxed text-wheat/70">
              Open the app to search events, set reminders, and start building
              your profile.
            </p>
            <Link
              href="/hackathons"
              className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-wheat px-6 text-sm font-semibold text-[#141414] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-wheat"
            >
              Open App
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
