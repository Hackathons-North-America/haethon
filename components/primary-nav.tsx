import Image from "next/image";
import Link from "next/link";

import { DiscordIcon } from "@/components/discord-icon";
import { HoverUnderline } from "@/components/hover-underline";

export function PrimaryNav() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-4 pt-4 sm:px-6 sm:pt-5">
      <nav
        aria-label="Primary navigation"
        className="pointer-events-auto mx-auto flex w-full max-w-[1080px] items-center justify-between gap-3 bg-paper px-3 py-2 sm:gap-4 sm:px-4 sm:py-2.5"
      >
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <Link
            href="/?home"
            className="flex items-center gap-2.5 rounded-[9999px] py-1 pl-1 pr-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
          >
            <Image
              src="/logo-beaver.png"
              alt="Hackathons North America"
              width={36}
              height={32}
              className="h-8 w-auto"
              priority
            />
            <span className="hidden text-[0.95rem] font-semibold tracking-tight text-ink sm:inline">
              HNA
            </span>
          </Link>

        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            className="group relative inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.8rem] font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine sm:px-5"
            href="/discord"
            rel="noreferrer"
            target="_blank"
          >
            <span className="hidden sm:inline">Join our Discord</span>
            <span className="sm:hidden">Discord</span>
            <DiscordIcon className="h-[0.8rem] w-auto" />
            <HoverUnderline className="inset-x-3.5 bottom-1 sm:inset-x-5" />
          </Link>
          <Link
            className="group relative rounded-full px-3 py-2 text-[0.8rem] font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine sm:px-4"
            href="/about"
          >
            About
            <HoverUnderline className="inset-x-3 bottom-1 sm:inset-x-4" />
          </Link>
          <Link
            className="group relative rounded-full px-4 py-2 text-[0.8rem] font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine sm:px-5"
            href="/hackathons"
          >
            Open App
            <HoverUnderline className="inset-x-4 bottom-1 sm:inset-x-5" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
