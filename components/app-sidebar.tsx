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

// Desktop rail: collapsed shows icons only, hover/keyboard-focus slides the
// panel open over the page content (Instagram-style) instead of pushing it.
// The <aside> keeps the collapsed width so the layout gutter never reflows.
// Keyboard focus uses :focus-visible rather than :focus-within so a mouse click
// on a link doesn't pin the rail open once the pointer leaves.
const expand = "lg:group-hover:w-64 lg:group-has-[:focus-visible]:w-64";
const revealLabel =
  "lg:translate-x-2 lg:opacity-0 lg:transition-[opacity,transform] lg:duration-700 lg:ease-out lg:group-hover:translate-x-0 lg:group-hover:opacity-100 lg:group-hover:delay-300 lg:group-has-[:focus-visible]:translate-x-0 lg:group-has-[:focus-visible]:opacity-100 lg:group-has-[:focus-visible]:delay-300 motion-reduce:lg:translate-x-0 motion-reduce:lg:transition-none";

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
      href: "/discord",
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

  // The phone bar is icons only and has no room for an outbound link, so
  // Discord stays a desktop-rail affordance.
  const barLinks = links.filter(({ external }) => !external);

  return (
    <>
      <motion.aside
        animate={{ opacity: 1, x: 0 }}
        className="group z-40 hidden bg-paper lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[4.75rem] lg:shrink-0"
        initial={prefersReducedMotion ? false : { opacity: 0, x: "-1.75rem" }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div
          className={`lg:absolute lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-[4.75rem] lg:flex-col lg:overflow-hidden lg:border-r lg:border-ink/15 lg:bg-paper lg:transition-[width,box-shadow] lg:duration-[1200ms] lg:ease-[cubic-bezier(0.22,1,0.36,1)] lg:group-hover:shadow-[10px_0_40px_-16px_rgba(27,25,23,0.35)] lg:group-has-[:focus-visible]:shadow-[10px_0_40px_-16px_rgba(27,25,23,0.35)] motion-reduce:lg:transition-none ${expand}`}
        >
          <div className="flex items-center gap-4 px-5 pb-0 pt-5 lg:block lg:shrink-0 lg:px-0 lg:pt-6 lg:text-center lg:transition-[padding] lg:duration-300 lg:ease-[cubic-bezier(0.22,1,0.36,1)] lg:group-hover:px-7 lg:group-hover:text-left lg:group-has-[:focus-visible]:px-7 lg:group-has-[:focus-visible]:text-left">
            <Link className="block" href={isSignedIn ? "/?home" : "/"}>
              <span className="whitespace-nowrap text-2xl font-semibold leading-none tracking-tight text-ink lg:text-xl">
                HNA
              </span>
            </Link>
          </div>

          <nav
            aria-label="App navigation"
            className="flex gap-1 overflow-x-auto px-3 py-3 lg:mt-6 lg:flex-col lg:overflow-visible lg:px-0 lg:py-0"
          >
            {links.map(({ href, icon: Icon, label, external }) => {
              const active = href === activeHref;

              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-3 pl-3 pr-1 text-sm font-medium transition-colors lg:min-h-12 lg:w-64 lg:gap-4 lg:px-7 ${
                    active ? "bg-pine text-paper" : "text-ink/55 hover:bg-pine/5 hover:text-ink"
                  }`}
                  href={href}
                  key={href}
                  rel={external ? "noreferrer" : undefined}
                  target={external ? "_blank" : undefined}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 lg:size-5" />
                  <span className={`whitespace-nowrap ${revealLabel}`}>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </motion.aside>

      {/* Phone tab bar: fixed to the bottom so it survives scrolling, padded for
          the home-indicator inset, every tab sharing the width evenly. */}
      <motion.nav
        animate={{ opacity: 1, y: 0 }}
        aria-label="App navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-ink/15 bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
        transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <ul className="flex items-stretch">
          {barLinks.map(({ href, icon: Icon, label }) => {
            const active = href === activeHref;

            return (
              <li className="flex-1" key={href}>
                <Link
                  aria-current={active ? "page" : undefined}
                  aria-label={label}
                  className="flex h-14 items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pine"
                  href={href}
                >
                  <Icon
                    aria-hidden="true"
                    className={`size-6 transition-colors ${active ? "text-pine" : "text-ink/45"}`}
                    strokeWidth={active ? 2.4 : 1.8}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </motion.nav>
    </>
  );
}
