"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Fragment, useState, type ElementType, type FocusEvent } from "react";

import { DiscordIcon } from "@/components/discord-icon";
import {
  Building2,
  CalendarDays,
  CircleUser,
  Compass,
  LogIn,
  PlusSquare,
  Settings,
  ShieldCheck,
  Swords,
  Users,
} from "lucide-react";

type SidebarLink = {
  href: string;
  icon: ElementType;
  label: string;
  external?: boolean;
  // Featured entries render like the other rows but add a small muted
  // description under the label, separated from neighbours by dividers.
  description?: string;
};

const items: SidebarLink[] = [
  { href: "/hackathons", icon: Compass, label: "Hackathons DB" },
  { href: "/face-off", icon: Swords, label: "Face Off" },
  { href: "/my", icon: CalendarDays, label: "My Hackathons" },
  { href: "/friends", icon: Users, label: "Friends" },
  { href: "/account", icon: CircleUser, label: "Hacker Profile" },
];

const collapsedWidth = 76;
const expandedWidth = 256;

// A near-critically-damped spring gives the rail Instagram's quick start and
// soft finish. Unlike a duration-based CSS transition, it also keeps its
// current velocity when the pointer reverses direction midway through.
const panelSpring = {
  type: "spring",
  stiffness: 320,
  damping: 32,
  mass: 0.9,
} as const;

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
  const [isHovered, setIsHovered] = useState(false);
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);
  const isExpanded = isHovered || hasKeyboardFocus;

  function handleFocusCapture(event: FocusEvent<HTMLElement>) {
    if ((event.target as HTMLElement).matches(":focus-visible")) {
      setHasKeyboardFocus(true);
    }
  }

  function handleBlurCapture(event: FocusEvent<HTMLElement>) {
    if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) {
      setHasKeyboardFocus(false);
    }
  }

  const links: SidebarLink[] = [
    ...(isAdmin ? [{ href: "/admin", icon: ShieldCheck, label: "Admin" }] : []),
    ...items,
    ...(isSignedIn
      ? [{ href: "/account/settings", icon: Settings, label: "Account Settings" }]
      : [{ href: "/sign-in", icon: LogIn, label: "Login" }]),
    {
      href: "/submit",
      icon: PlusSquare,
      label: "New hackathon",
      description:
        "Enter a new hackathon — one you just spotted or one you're organizing yourself.",
    },
    {
      href: "/discord",
      icon: DiscordIcon,
      label: "Join our Discord",
      external: true,
    },
    ...(isOrganizer ? [{ href: "/organizer", icon: Building2, label: "Organizer" }] : []),
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
        className="z-40 hidden bg-paper lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[4.75rem] lg:shrink-0"
        initial={prefersReducedMotion ? false : { opacity: 0, x: "-1.75rem" }}
        onBlurCapture={handleBlurCapture}
        onFocusCapture={handleFocusCapture}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          animate={{
            width: isExpanded ? expandedWidth : collapsedWidth,
            boxShadow: isExpanded
              ? "10px 0 40px -16px rgba(27, 25, 23, 0.35)"
              : "0 0 0 0 rgba(27, 25, 23, 0)",
          }}
          className="lg:absolute lg:inset-y-0 lg:left-0 lg:z-50 lg:flex lg:w-[4.75rem] lg:will-change-[width] lg:flex-col lg:overflow-hidden lg:border-r lg:border-ink/15 lg:bg-paper"
          initial={false}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : {
                  width: panelSpring,
                  boxShadow: { duration: 0.22, ease: "easeOut" },
                }
          }
        >
          <div className="flex items-center gap-4 px-5 pb-0 pt-5 lg:w-[4.75rem] lg:shrink-0 lg:justify-center lg:px-0 lg:pt-6">
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
            {links.map(({ href, icon: Icon, label, external, description }) => {
              const active = href === activeHref;
              const labelTransition = prefersReducedMotion
                ? { duration: 0 }
                : {
                    delay: isExpanded ? 0.065 : 0,
                    duration: isExpanded ? 0.2 : 0.12,
                    ease: isExpanded ? ([0.16, 1, 0.3, 1] as const) : ("easeOut" as const),
                  };

              if (description) {
                return (
                  <Fragment key={href}>
                    <div aria-hidden="true" className="mx-5 my-2 border-t border-ink/10 lg:mx-6" />
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex min-h-10 shrink-0 flex-col justify-center py-3 pl-3 pr-1 text-sm font-medium transition-colors lg:min-h-12 lg:w-64 lg:px-7 ${
                        active ? "text-pine" : "text-ink/55 hover:bg-pine/5 hover:text-ink"
                      }`}
                      href={href}
                    >
                      <span className="inline-flex items-center gap-3 lg:gap-4">
                        <Icon aria-hidden="true" className="size-4 shrink-0 lg:size-5" />
                        <motion.span
                          animate={{
                            opacity: isExpanded ? 1 : 0,
                            x: isExpanded ? 0 : -6,
                          }}
                          className="whitespace-nowrap"
                          initial={false}
                          transition={labelTransition}
                        >
                          {label}
                        </motion.span>
                      </span>
                      {/* Collapsed, the description must give up its layout
                          height too — opacity alone would leave the rail row
                          as tall as the expanded card. */}
                      <motion.span
                        animate={{
                          height: isExpanded ? "auto" : 0,
                          opacity: isExpanded ? 1 : 0,
                        }}
                        className="overflow-hidden"
                        initial={false}
                        transition={prefersReducedMotion ? { duration: 0 } : panelSpring}
                      >
                        {/* pl matches icon width + gap so the description sits
                            flush under the label rather than the icon. */}
                        <span
                          className={`block w-40 pl-7 pt-1 text-xs leading-snug lg:pl-9 ${
                            active ? "text-pine/70" : "text-ink/50"
                          }`}
                        >
                          {description}
                        </span>
                      </motion.span>
                    </Link>
                    <div aria-hidden="true" className="mx-5 my-2 border-t border-ink/10 lg:mx-6" />
                  </Fragment>
                );
              }

              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-3 pl-3 pr-1 text-sm font-medium transition-colors lg:min-h-12 lg:w-64 lg:gap-4 lg:px-7 ${
                    active ? "text-pine" : "text-ink/55 hover:bg-pine/5 hover:text-ink"
                  }`}
                  href={href}
                  key={href}
                  rel={external ? "noreferrer" : undefined}
                  target={external ? "_blank" : undefined}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 lg:size-5" />
                  <motion.span
                    animate={{
                      opacity: isExpanded ? 1 : 0,
                      x: isExpanded ? 0 : -6,
                    }}
                    className="whitespace-nowrap"
                    initial={false}
                    transition={labelTransition}
                  >
                    {label}
                  </motion.span>
                </Link>
              );
            })}
          </nav>
        </motion.div>
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
