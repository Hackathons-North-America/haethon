"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { DiscordIcon } from "@/components/discord-icon";
import {
  Archive,
  Building2,
  CalendarDays,
  CircleUser,
  Compass,
  Settings,
  ShieldCheck,
} from "lucide-react";

const items = [
  { href: "/hackathons", icon: Compass, label: "Hackathons DB" },
  { href: "/archive", icon: Archive, label: "Archive" },
  { href: "/my", icon: CalendarDays, label: "My Hackathons" },
  { href: "/account", icon: CircleUser, label: "Hacker Profile" },
  { href: "/account/settings", icon: Settings, label: "Account Settings" },
];

export function AppSidebar({
  isAdmin,
  isOrganizer,
  isSignedIn,
}: {
  isAdmin: boolean;
  isOrganizer: boolean;
  isSignedIn: boolean;
}) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();

  const links = [
    ...items,
    ...(isOrganizer ? [{ href: "/organizer", icon: Building2, label: "Organizer" }] : []),
    ...(isAdmin ? [{ href: "/admin", icon: ShieldCheck, label: "Admin" }] : []),
  ];

  // The active link is the one whose href is the longest matching prefix of the
  // current path, so /account/settings highlights Settings rather than both it and Hacker Profile.
  const activeHref = links
    .filter(({ href }) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <motion.aside
      animate={{ opacity: 1, x: 0 }}
      className="z-40 border-b border-navy/10 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-[#141414]/60 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r"
      initial={prefersReducedMotion ? false : { opacity: 0, x: "-1.75rem" }}
      transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between gap-4 px-5 pb-0 pt-5 lg:block lg:px-5">
        <Link className="block" href={isSignedIn ? "/?home" : "/"}>
          <span className="font-serif text-2xl font-semibold leading-none text-navy dark:text-wheat">HNA</span>
        </Link>
        {!isSignedIn ? (
          <Link
            className="inline-flex rounded-full min-h-9 items-center justify-center border border-cabernet dark:border-[#e4a3ab]/50 px-4 font-mono text-xs font-medium uppercase tracking-[0.14em] text-cabernet dark:text-[#e4a3ab] transition-colors hover:bg-cabernet hover:text-wheat lg:hidden"
            href="/sign-in"
          >
            Login
          </Link>
        ) : null}
      </div>

      <nav
        aria-label="App navigation"
        className="flex gap-1 overflow-x-auto px-3 py-3 lg:mt-6 lg:flex-col lg:overflow-visible lg:px-3"
      >
        {links.map(({ href, icon: Icon, label }) => {
          const active = href === activeHref;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-10 shrink-0 items-center gap-3 rounded-full px-3 text-sm font-semibold transition-colors ${
                active ? "bg-cabernet text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white" : "text-navy/70 dark:text-wheat/70 hover:bg-ivory dark:hover:bg-white/10 hover:text-navy dark:hover:text-wheat"
              }`}
              href={href}
              key={href}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pb-3">
        <Link
          className="inline-flex min-h-10 w-full shrink-0 items-center gap-3 rounded-full px-3 text-sm font-semibold text-navy/70 transition-colors hover:bg-ivory hover:text-navy dark:text-wheat/70 dark:hover:bg-white/10 dark:hover:text-wheat"
          href="https://discord.gg/wcNfUUVgqe"
          rel="noreferrer"
          target="_blank"
        >
          <DiscordIcon className="size-4" />
          Join our Discord
        </Link>
      </div>

      {!isSignedIn ? (
        <div className="hidden px-5 pb-6 lg:block">
          <Link
            className="inline-flex rounded-full min-h-10 w-full items-center justify-center border border-cabernet dark:border-[#e4a3ab]/50 px-4 font-mono text-xs font-medium uppercase tracking-[0.14em] text-cabernet dark:text-[#e4a3ab] transition-colors hover:bg-cabernet hover:text-wheat"
            href="/sign-in"
          >
            Login
          </Link>
        </div>
      ) : null}
    </motion.aside>
  );
}
