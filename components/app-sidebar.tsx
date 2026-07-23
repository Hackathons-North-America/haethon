"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import type { ElementType } from "react";

import { DiscordIcon } from "@/components/discord-icon";
import {
  Building2,
  CalendarDays,
  CircleUser,
  Compass,
  LogIn,
  Settings,
  ShieldCheck,
  Swords,
} from "lucide-react";

type SidebarLink = {
  href: string;
  icon: ElementType;
  label: string;
  external?: boolean;
};

const items: SidebarLink[] = [
  { href: "/hackathons", icon: Compass, label: "Hackathons DB" },
  { href: "/face-off", icon: Swords, label: "Face Off" },
  { href: "/my", icon: CalendarDays, label: "My Hackathons" },
  { href: "/account", icon: CircleUser, label: "Hacker Profile" },
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

  const links: SidebarLink[] = [
    ...items,
    ...(isSignedIn
      ? [{ href: "/account/settings", icon: Settings, label: "Account Settings" }]
      : [{ href: "/sign-in", icon: LogIn, label: "Login" }]),
    {
      href: "https://discord.gg/wcNfUUVgqe",
      icon: DiscordIcon,
      label: "Join our Discord",
      external: true,
    },
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
      className="z-40 border-b border-ink/15 bg-paper lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-fit lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r"
      initial={prefersReducedMotion ? false : { opacity: 0, x: "-1.75rem" }}
      transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center gap-4 px-5 pb-0 pt-5 lg:block lg:px-5">
        <Link className="block" href={isSignedIn ? "/?home" : "/"}>
          <span className="text-2xl font-semibold leading-none tracking-tight text-ink">HNA</span>
        </Link>
      </div>

      <nav
        aria-label="App navigation"
        className="flex gap-1 overflow-x-auto px-3 py-3 lg:mt-6 lg:flex-col lg:overflow-visible lg:pl-3 lg:pr-10"
      >
        {links.map(({ href, icon: Icon, label, external }) => {
          const active = href === activeHref;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-10 shrink-0 items-center gap-3 pl-3 pr-1 text-sm font-medium transition-colors lg:w-40 ${
                active ? "bg-pine text-paper" : "text-ink/55 hover:bg-pine/10 hover:text-ink"
              }`}
              href={href}
              key={href}
              rel={external ? "noreferrer" : undefined}
              target={external ? "_blank" : undefined}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </motion.aside>
  );
}
