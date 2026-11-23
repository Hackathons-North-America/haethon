import type { Metadata } from "next";
import Link from "next/link";

import { LandingNav } from "@/components/landing/landing-nav";

export const metadata: Metadata = {
  title: "Corporate · Hackathons North America",
};

// Placeholder for the Products → Corporate menu item until the real page is
// written. Public in proxy.ts so signed-out visitors can reach it.
export default function CorporatePage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <LandingNav />
      <section className="mx-auto max-w-[640px] px-6 pb-40 pt-32 text-center">
        <p className="text-[17px] font-medium">Corporate</p>
        <h1 className="mt-4 text-[2.75rem] font-medium leading-[1.05] tracking-[-0.045em] sm:text-[3.5rem]">
          Meet the hackers building what&apos;s next.
        </h1>
        <p className="mt-6 text-[20px] leading-[1.35] text-black/70">
          Sponsorship and recruiting with Hackathons North America is coming soon.
        </p>
        <Link
          className="mt-[34px] inline-flex h-[60px] items-center rounded-full bg-black px-[26px] text-[20px] font-medium text-white transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          href="/"
        >
          Back to home
        </Link>
      </section>
    </main>
  );
}
