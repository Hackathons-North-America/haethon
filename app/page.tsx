import Link from "next/link";

import { HeroTypewriterSpan } from "@/components/hero-typewriter-span";
import { MacbookHero } from "@/components/ui/macbook-hero";

const navItems = [
  { label: "About", href: "/about" },
  { label: "FQA", href: "#fqa" },
];

const navLinkClassName =
  "decoration-[#660000] decoration-1 underline-offset-6 hover:text-[#660000] hover:underline focus-visible:text-[#660000] focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]";

const openAppLinkClassName =
  "inline-flex min-h-9 items-center justify-center border border-[#660000] px-4 text-[#660000] transition-colors hover:bg-[#660000] hover:text-white focus-visible:bg-[#660000] focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]";

const showcaseBlocks = [
  {
    id: "agents",
    heading: "Find every hackathon in one place",
    company: "One directory",
    caption:
      "for hundreds of hackathons across North America — search by name and filter by location, date, and format.",
    features: [
      "Smart Search",
      "Location & Date Filters",
      "Beginner-Friendly",
      "Travel Reimbursement",
    ],
  },
  {
    id: "scale",
    heading: "Never miss another application deadline",
    company: "Automatic reminders",
    caption:
      "for application openings, closings, decisions, and check-in — sent straight to your inbox.",
    features: [
      "Application Reminders",
      "Decision Alerts",
      "Event Countdowns",
      "Email Notifications",
    ],
  },
  {
    id: "platforms",
    heading: "Build a profile that proves what you've shipped",
    company: "Verified attendance",
    caption:
      "and wins pinned to your profile, with an activity heatmap of every hackathon you've been to.",
    features: [
      "Pipeline Tracking",
      "Verified Check-In",
      "Pinned Wins",
      "Activity Heatmap",
    ],
  },
];

function AgentChatVisual() {
  return (
    <div className="grid min-h-[300px] grid-cols-[0.26fr_1fr] sm:min-h-[430px]">
      <div className="space-y-3 border-r border-black/10 p-5 sm:p-7">
        <div className="h-2.5 w-3/4 rounded bg-white/20" />
        <div className="h-2.5 w-1/2 rounded bg-white/10" />
        <div className="h-2.5 w-2/3 rounded bg-white/10" />
        <div className="h-2.5 w-3/5 rounded bg-white/10" />
        <div className="h-2.5 w-1/2 rounded bg-white/10" />
      </div>
      <div className="flex flex-col p-5 sm:p-7">
        <div className="max-w-[62%] space-y-2 rounded-lg bg-white/10 p-4">
          <div className="h-2 rounded bg-white/25" />
          <div className="h-2 w-4/5 rounded bg-white/25" />
        </div>
        <div className="mt-4 max-w-[54%] space-y-2 self-end rounded-lg bg-white/20 p-4">
          <div className="h-2 rounded bg-white/40" />
          <div className="h-2 w-2/3 rounded bg-white/40" />
        </div>
        <div className="max-w-[62%] space-y-2 rounded-lg bg-white/10 p-4 sm:mt-4">
          <div className="h-2 rounded bg-white/25" />
          <div className="h-2 w-3/4 rounded bg-white/25" />
          <div className="h-2 w-1/2 rounded bg-white/25" />
        </div>
        <div className="mt-auto flex items-center gap-3 rounded-lg border border-black/15 p-3">
          <div className="h-2 w-1/3 rounded bg-white/15" />
          <div className="ml-auto size-6 rounded bg-white/90" />
        </div>
      </div>
    </div>
  );
}

function ScaleDashboardVisual() {
  return (
    <div className="min-h-[300px] p-5 sm:min-h-[430px] sm:p-7">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {["82ms", "12.4M", "99.99%"].map((stat) => (
          <div
            key={stat}
            className="rounded-lg border border-black/10 bg-white/5 p-4 sm:p-5"
          >
            <div className="h-2 w-1/2 rounded bg-white/15" />
            <div className="mt-4 text-xl font-semibold text-black sm:text-2xl">
              {stat}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex h-40 items-end gap-1.5 rounded-lg border border-black/10 bg-white/5 p-4 sm:mt-5 sm:h-56 sm:gap-2 sm:p-6">
        {[18, 24, 20, 32, 28, 44, 38, 56, 48, 70, 62, 84, 76, 96, 88, 100].map(
          (height, i) => (
            <span
              key={`${height}-${i}`}
              className="flex-1 rounded-t bg-white/30"
              style={{ height: `${height}%` }}
            />
          )
        )}
      </div>
    </div>
  );
}

function DocsPlatformVisual() {
  return (
    <div className="flex min-h-[300px] flex-col sm:min-h-[430px]">
      <div className="flex items-center gap-2 border-b border-black/10 px-5 py-4 sm:px-7">
        <span className="size-2 rounded-full bg-white/20" />
        <span className="size-2 rounded-full bg-white/20" />
        <span className="size-2 rounded-full bg-white/20" />
        <span className="ml-4 h-5 w-44 rounded-full bg-white/10" />
        <span className="ml-auto h-5 w-16 rounded-full bg-white/90" />
      </div>
      <div className="grid flex-1 grid-cols-[0.24fr_1fr] sm:grid-cols-[0.22fr_1fr_0.18fr]">
        <div className="space-y-3 border-r border-black/10 p-5 sm:p-7">
          <div className="h-2 w-4/5 rounded bg-white/20" />
          <div className="h-2 w-3/5 rounded bg-white/10" />
          <div className="h-2 w-2/3 rounded bg-white/10" />
          <div className="h-2 w-1/2 rounded bg-white/10" />
          <div className="h-2 w-3/5 rounded bg-white/10" />
        </div>
        <div className="p-5 sm:p-7">
          <div className="h-4 w-1/3 rounded bg-white/25" />
          <div className="mt-5 space-y-3">
            <div className="h-2 rounded bg-white/10" />
            <div className="h-2 w-11/12 rounded bg-white/10" />
            <div className="h-2 w-4/5 rounded bg-white/10" />
          </div>
          <div className="mt-6 h-24 rounded-lg border border-black/10 bg-black/25 sm:h-32" />
          <div className="mt-6 space-y-3">
            <div className="h-2 rounded bg-white/10" />
            <div className="h-2 w-2/3 rounded bg-white/10" />
          </div>
        </div>
        <div className="hidden space-y-3 border-l border-black/10 p-7 sm:block">
          <div className="h-2 w-full rounded bg-white/15" />
          <div className="h-2 w-3/4 rounded bg-white/10" />
          <div className="h-2 w-4/5 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

const showcaseVisuals: Record<string, () => React.JSX.Element> = {
  agents: AgentChatVisual,
  scale: ScaleDashboardVisual,
  platforms: DocsPlatformVisual,
};

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#F8F8F4] text-black">
      <nav
        aria-label="Primary navigation"
        className="border-b border-black/10 bg-white px-8 font-mono text-xs font-medium uppercase tracking-[0.14em] text-[#706F6B] sm:px-14 lg:px-20"
      >
        <div className="mx-auto flex min-h-20 max-w-[1120px] flex-col items-start justify-center gap-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-0">
          <Link
            href="/"
            className={`${navLinkClassName} font-serif text-xl font-semibold normal-case leading-none tracking-normal text-black sm:text-2xl`}
          >
            Hackathons North America
          </Link>

          <div className="flex flex-wrap items-center justify-start gap-x-5 gap-y-3 sm:justify-end sm:gap-x-8">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={navLinkClassName}
              >
                {item.label}
              </Link>
            ))}
            <Link className={openAppLinkClassName} href="/hackathons">
              Open App
            </Link>
          </div>
        </div>
      </nav>

      {/* The white hero ends exactly at the keyboard cutoff; the cast shadow
          from the MacBook overflows onto the tinted section below. */}
      <section className="relative isolate bg-white px-8 pt-12 sm:px-14 sm:pt-16 md:pt-[5.5rem] lg:px-20">
        <div className="mx-auto w-full max-w-[520px] sm:max-w-[520px] md:max-w-[680px] lg:max-w-[840px] xl:max-w-[980px] 2xl:max-w-[1120px]">
          <h1
            aria-label="Search hundreds of upcoming hackathons, build your profile, and never miss another application deadline."
            className="w-full text-[1.6rem] font-semibold leading-[1.5] tracking-normal text-black sm:text-[1.9rem] lg:text-[2rem]"
          >
            Search hundreds of upcoming hackathons, build your profile, and{" "}
            <HeroTypewriterSpan />
          </h1>
        </div>

        <div className="mx-auto w-full max-w-[1120px]">
          <MacbookHero />
        </div>
      </section>

      <section
        aria-labelledby="showcase-agents-heading"
        className="relative z-10 -mt-[3%] overflow-hidden bg-gray-200 px-6 pb-32 pt-24 text-left text-black sm:pt-28"
      >
        {showcaseBlocks.map((block, index) => {
          const Visual = showcaseVisuals[block.id];
          const mirrored = index % 2 === 1;

          return (
            <div key={block.id} className={index > 0 ? "mt-40 sm:mt-64" : undefined}>
              <h2
                id={`showcase-${block.id}-heading`}
                className={`max-w-[820px] text-4xl font-semibold leading-[1.14] tracking-[-0.02em] sm:text-5xl lg:text-[3.5rem] ${
                  mirrored ? "lg:ml-[34%]" : ""
                }`}
              >
                {block.heading}
              </h2>

              <div className="mt-10 flex flex-col gap-12 lg:mt-14 lg:flex-row lg:items-center lg:justify-between">
                <div
                  className={`w-full overflow-hidden rounded-xl border border-black/10 bg-white/[0.04] lg:w-[66%] ${
                    mirrored ? "lg:order-2" : ""
                  }`}
                >
                  <Visual />
                </div>

                <div className={`max-w-[360px] lg:w-[24%] ${mirrored ? "lg:order-1" : ""}`}>
                  <p className="text-2xl font-medium leading-[1.22] tracking-tight sm:text-[1.75rem]">
                    <span className="text-[#660000]">{block.company}</span>{" "}
                    {block.caption}
                  </p>

                  <div className="mt-10 font-mono text-[0.8125rem]">
                    <div className="text-[#660000]">Features</div>
                    <ul className="mt-3 space-y-2 uppercase tracking-[0.04em]">
                      {block.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="mt-40 sm:mt-64">
          <h2 className="text-4xl font-semibold leading-[1.14] tracking-[-0.02em] sm:text-5xl lg:text-[3.5rem]">
            What we offer
          </h2>

          <div className="mt-10 grid gap-5 lg:mt-14 lg:grid-cols-2">
            <article className="relative flex min-h-[420px] flex-col justify-end overflow-hidden rounded-xl border border-black/10 bg-white/[0.04] p-8 lg:min-h-[560px]">
              <div aria-hidden="true" className="absolute inset-0">
                <div className="absolute left-0 top-[12%] h-14 w-[58%] border border-black/15" />
                <div className="absolute left-0 top-[46%] h-14 w-[22%] border border-black/15" />
                <div className="absolute bottom-[22%] left-0 h-14 w-[32%] border border-black/15" />
                <div className="absolute bottom-[18%] right-[14%] h-[62%] w-28 -skew-x-[28deg] border border-black/15" />
              </div>
              <div className="relative">
                <div className="font-mono text-xs uppercase tracking-[0.14em] text-[#660000]">
                  For businesses
                </div>
                <div className="mt-3 text-3xl font-semibold tracking-tight">
                  We host your hackathon
                </div>
                <p className="mt-4 max-w-[420px] text-sm leading-relaxed text-black/60">
                  Run a hackathon with HNA end to end — or use our resources and
                  playbooks to learn how to host your own.
                </p>
              </div>
            </article>

            <div className="grid gap-5">
              <article className="flex min-h-[270px] overflow-hidden rounded-xl border border-black/10 bg-white/[0.04]">
                <div className="flex flex-1 flex-col justify-center p-8">
                  <div className="font-mono text-xs uppercase tracking-[0.14em] text-[#660000]">
                    For hackers
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight sm:text-[2rem]">
                    Track every hackathon
                  </h3>
                  <p className="mt-3 max-w-[300px] text-sm leading-relaxed text-black/60">
                    One place to discover events, follow deadlines, and keep a
                    record of every hackathon you attend and win.
                  </p>
                </div>
                <div
                  aria-hidden="true"
                  className="hidden w-[42%] flex-col justify-between bg-black/40 p-6 pt-8 font-mono text-[0.8125rem] sm:flex"
                >
                  <div className="space-y-1.5 text-white/70">
                    <div>Interested</div>
                    <div>Applied</div>
                    <div>Accepted</div>
                    <div className="text-white">Attending</div>
                  </div>
                  <div className="text-white/50">12 tracked · 3 wins</div>
                </div>
              </article>

              <article className="flex min-h-[270px] overflow-hidden rounded-xl border border-black/10 bg-white/[0.04]">
                <div className="flex flex-1 flex-col justify-end p-8">
                  <div className="font-mono text-xs uppercase tracking-[0.14em] text-[#660000]">
                    For organizers
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight sm:text-[2rem]">
                    Publish &amp; grow
                  </h3>
                  <p className="mt-3 max-w-[300px] text-sm leading-relaxed text-black/60">
                    List your hackathon to reach more hackers, get advice from
                    organizers who&apos;ve done it before, and tap HNA&apos;s
                    marketing reach.
                  </p>
                </div>
                <div
                  aria-hidden="true"
                  className="hidden w-[52%] flex-col gap-1.5 bg-black/40 p-6 pt-8 font-mono text-[0.8125rem] sm:flex"
                >
                  <div className="text-white/50">Publish hackathon</div>
                  <div className="mt-2 space-y-1.5">
                    <div>
                      <span className="text-emerald-400">✓</span> Listed to
                      thousands of hackers
                    </div>
                    <div>
                      <span className="text-emerald-400">✓</span> Mentorship from
                      seasoned organizers
                    </div>
                    <div>
                      <span className="text-emerald-400">✓</span> Promoted across
                      HNA channels
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-white/50">Sign-ups:</span> growing
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>

      </section>
    </main>
  );
}
