import Link from "next/link";

import { HackathonSubmissionForm } from "@/components/forms/hackathon-submission-form";
import { NavAuthLink } from "@/components/nav-auth-link";

const navItems = [
  { label: "About", href: "/#about" },
  { label: "FQA", href: "/#fqa" },
  { label: "Submit", href: "/submit" },
  { label: "Hackathons", href: "/hackathons" },
];

const navLinkClassName =
  "decoration-[#555555] decoration-1 underline-offset-6 hover:text-[#333333] hover:underline focus-visible:text-[#333333] focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#555555]";

const loginLinkClassName =
  "inline-flex min-h-9 items-center justify-center border border-[#777777] px-4 text-[#555555] transition-colors hover:bg-[#555555] hover:text-white focus-visible:bg-[#555555] focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#555555]";

export default function SubmitPage() {
  return (
    <div className="min-h-screen bg-[#E6E6E6] text-[#181818]">
      <nav
        aria-label="Primary navigation"
        className="border-b border-black/10 bg-[#E6E6E6] px-8 font-mono text-xs font-medium uppercase tracking-[0.14em] text-[#666666] sm:px-14 lg:px-20"
      >
        <div className="mx-auto flex min-h-20 max-w-[1120px] flex-col items-start justify-center gap-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-0">
          <Link
            href="/"
            className={`${navLinkClassName} font-serif text-xl font-semibold normal-case leading-none tracking-normal text-[#222222] sm:text-2xl`}
          >
            Hackathons North America
          </Link>

          <div className="flex flex-wrap items-center justify-start gap-x-5 gap-y-3 sm:justify-end sm:gap-x-8">
            {navItems.map((item) => (
              <Link
                aria-current={item.href === "/submit" ? "page" : undefined}
                className={`${navLinkClassName} ${
                  item.href === "/submit" ? "text-[#333333] underline" : ""
                }`}
                href={item.href}
                key={item.label}
              >
                {item.label}
              </Link>
            ))}
            <NavAuthLink className={loginLinkClassName} />
          </div>
        </div>
      </nav>

      <main className="px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <div className="max-w-3xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#5F5F5F]">Hackathon submission</p>
            <h1 className="text-4xl font-semibold text-[#181818] md:text-5xl">Submit a hackathon</h1>
            <p className="text-base leading-7 text-[#5F5F5F]">
              Send official organizer details or contribute a community tip when you only know the basics.
              Every community submission goes through review before it becomes public.
            </p>
          </div>
          <HackathonSubmissionForm />
        </div>
      </main>
    </div>
  );
}
