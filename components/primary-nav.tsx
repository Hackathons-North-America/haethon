import Image from "next/image";
import Link from "next/link";

import { DiscordIcon } from "@/components/discord-icon";

const navItems = [{ label: "About", href: "/about" }];

type PrimaryNavProps = {
  activeHref?: string;
};

export function PrimaryNav({ activeHref }: PrimaryNavProps) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-4 pt-4 sm:px-6 sm:pt-5">
      <nav
        aria-label="Primary navigation"
        className="pointer-events-auto mx-auto flex w-full max-w-[1080px] items-center justify-between gap-3 rounded-full border border-navy/10 bg-white/90 px-3 py-2 shadow-[0_10px_36px_-14px_rgba(29,42,68,0.28)] backdrop-blur-xl sm:gap-4 sm:px-4 sm:py-2.5 dark:border-white/10 dark:bg-[#141414]/75 dark:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.65)]"
      >
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <Link
            href="/?home"
            className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-navy/[0.04] dark:hover:bg-white/5"
          >
            <Image
              src="/logo-beaver.png"
              alt="Hackathons North America"
              width={36}
              height={32}
              className="h-8 w-auto"
              priority
            />
            <span className="hidden font-serif text-[0.95rem] font-semibold tracking-tight text-navy sm:inline dark:text-wheat">
              HNA
            </span>
          </Link>

          {navItems.map((item) => (
            <Link
              aria-current={item.href === activeHref ? "page" : undefined}
              className={`rounded-full px-3 py-2 text-[0.8rem] font-medium transition-colors sm:px-3.5 ${
                item.href === activeHref
                  ? "bg-navy/[0.06] text-navy dark:bg-white/10 dark:text-wheat"
                  : "text-navy/50 hover:bg-navy/[0.04] hover:text-navy dark:text-white/55 dark:hover:bg-white/5 dark:hover:text-wheat"
              }`}
              href={item.href}
              key={item.label}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-full bg-[#5865F2] px-4 py-2 text-[0.8rem] font-semibold text-white transition-colors hover:bg-[#4752c4] sm:px-5"
            href="https://discord.gg/wcNfUUVgqe"
            rel="noreferrer"
            target="_blank"
          >
            Join our Discord
            <DiscordIcon className="h-4 w-auto" />
          </Link>
          <Link
            className="rounded-full bg-cabernet px-4 py-2 text-[0.8rem] font-semibold text-wheat transition-colors hover:bg-[#5c151c] sm:px-5 dark:bg-wheat dark:text-[#141414] dark:hover:bg-white"
            href="/hackathons"
          >
            Open App
          </Link>
        </div>
      </nav>
    </header>
  );
}
