import Link from "next/link";
import type { ReactNode } from "react";

import { DotsIcon, FlagsIcon, GlobeStarIcon, TicketIcon } from "@/components/landing/feature-icons";
import { HeroToolbox } from "@/components/landing/hero-toolbox";
import { LandingNav } from "@/components/landing/landing-nav";
import { WatercolorBackdrop } from "@/components/watercolor-backdrop";

const features: { icon: ReactNode; label: string }[] = [
  { icon: <FlagsIcon />, label: "Find hackathons across the US and Canada" },
  { icon: <TicketIcon />, label: "Track every application in one pipeline" },
  { icon: <GlobeStarIcon />, label: "Build a hacker profile from Devpost" },
  { icon: <DotsIcon />, label: "Check in, vote, and show what you shipped" },
];

export default function Home() {
  // Signed-in visitors are redirected into the app by the proxy, keeping this
  // page fully static.
  return (
    <main className="min-h-screen overflow-x-clip bg-white text-black">
      {/* The sky's height is chosen so the dome's peak crosses the toolbox
          about 39% of the way down, like a horizon behind it. It is the sum of
          the fixed heights above that point: nav (82) + section padding +
          eyebrow line (20) + art margin + 39% of the art's height. Change any
          of those and update the two numbers here. */}
      <div className="relative [--dome:max(24px,2.6vw)]">
        <WatercolorBackdrop dome className="absolute inset-x-0 top-0 h-[calc(288px+var(--dome))] xl:h-[calc(381px+var(--dome))]" />
        <LandingNav />

        <section className="relative px-6 pt-16 text-center xl:pt-[122px]">
          <p className="text-[17px] font-medium leading-5">Every hackathon in North America</p>

          <div className="relative mt-8 xl:mt-11">
            <HeroToolbox className="relative mx-auto h-auto w-[240px] xl:w-[300px]" />

            {/* On wide screens the two halves flank the art, each tilted to
                follow the curve of the horizon; the empty middle column is the
                art's width. Below xl they stack under it. */}
            <h1 className="mx-auto mt-8 max-w-[22rem] text-[2.75rem] font-medium leading-[1.05] tracking-[-0.045em] sm:text-[3.25rem] xl:absolute xl:inset-x-0 xl:top-[79%] xl:mt-0 xl:grid xl:max-w-none xl:-translate-y-1/2 xl:grid-cols-[minmax(0,1fr)_300px_minmax(0,1fr)] xl:gap-16 xl:text-[clamp(2.875rem,3.6vw,4.375rem)]">
              <span className="block xl:origin-right xl:-rotate-[2.5deg] xl:whitespace-nowrap xl:text-right">
                Find a hackathon.
              </span>
              <span aria-hidden="true" className="hidden xl:block" />
              <span className="block xl:origin-left xl:rotate-[2.5deg] xl:whitespace-nowrap xl:text-left">
                Ship something.
              </span>
            </h1>
          </div>

          <p className="mx-auto mt-10 max-w-[600px] text-[18px] leading-[1.35] sm:text-[20px] xl:mt-[115px]">
            Hackathons move fast. Your plans need to keep up. Events across the US and Canada. Discovery, applications,
            check-in, and your hacker profile in one place. No spreadsheet required.
          </p>

          <Link
            className="mt-[34px] inline-flex h-[60px] items-center rounded-full bg-black px-[26px] text-[20px] font-medium text-white transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            href="/hackathons"
          >
            Browse hackathons
          </Link>
        </section>

        <section aria-label="What you can do" className="px-6 pb-40 pt-28 xl:pt-[210px]">
          <ul className="mx-auto grid max-w-[1748px] grid-cols-1 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon, label }) => (
              <li className="flex flex-col items-center text-center" key={label}>
                <div className="flex h-9 items-center justify-center">{icon}</div>
                <p className="mt-[14px] max-w-[270px] text-[20px] leading-[1.3]">{label}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
