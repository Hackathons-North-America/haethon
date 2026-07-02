import Link from "next/link";

import { NavAuthLink } from "@/components/nav-auth-link";

const navItems = [
  { label: "About", href: "/#about" },
  { label: "FQA", href: "/#fqa" },
  { label: "Submit", href: "/submit" },
  { label: "Hackathons", href: "/hackathons" },
];

const navLinkClassName =
  "decoration-[#660000] decoration-1 underline-offset-6 hover:text-[#660000] hover:underline focus-visible:text-[#660000] focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]";

const loginLinkClassName =
  "inline-flex min-h-9 items-center justify-center border border-[#660000] px-4 text-[#660000] transition-colors hover:bg-[#660000] hover:text-white focus-visible:bg-[#660000] focus-visible:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#660000]";

type PrimaryNavProps = {
  activeHref?: string;
  className?: string;
};

export function PrimaryNav({ activeHref, className = "bg-white" }: PrimaryNavProps) {
  return (
    <header className={`sticky top-0 z-40 ${className}`}>
      <nav
        aria-label="Primary navigation"
        className="border-b border-black/10 px-8 font-mono text-xs font-medium uppercase tracking-[0.14em] text-[#706F6B] sm:px-14 lg:px-20"
      >
        <div className="mx-auto flex min-h-20 max-w-[1120px] flex-col items-start justify-center gap-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-0">
          <Link
            className={`${navLinkClassName} font-serif text-xl font-semibold normal-case leading-none tracking-normal text-black sm:text-2xl`}
            href="/"
          >
            Hackathons North America
          </Link>

          <div className="flex flex-wrap items-center justify-start gap-x-5 gap-y-3 sm:justify-end sm:gap-x-8">
            {navItems.map((item) => (
              <Link
                aria-current={item.href === activeHref ? "page" : undefined}
                className={`${navLinkClassName} ${item.href === activeHref ? "text-[#660000] underline" : ""}`}
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
    </header>
  );
}
