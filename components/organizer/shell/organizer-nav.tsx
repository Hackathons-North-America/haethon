"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ElementType } from "react";
import { ArrowLeft, CalendarDays, ClipboardCheck } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = {
  href: string;
  icon: ElementType;
  label: string;
  isActive: (pathname: string) => boolean;
};

const REVIEW_PATH = "/organizer/review";

/* "Hackathons" owns the overview and every per-hackathon page under it
   (/organizer/[id]), so it stays highlighted while an organizer is inside one
   of their events. The review queue is the only other sub-route. */
const items: NavItem[] = [
  {
    href: "/organizer",
    icon: CalendarDays,
    label: "Hackathons",
    isActive: (pathname) =>
      pathname === "/organizer" ||
      (pathname.startsWith("/organizer/") && !isReviewPath(pathname)),
  },
  {
    href: REVIEW_PATH,
    icon: ClipboardCheck,
    label: "Review queue",
    isActive: isReviewPath,
  },
];

/* The hacker-facing home an organizer returns to. /dashboard no longer
   exists (it would 404), so this is /my, the signed-in app's landing page
   ("My Hackathons"). */
const APP_HOME = "/my";

function isReviewPath(pathname: string) {
  return pathname === REVIEW_PATH || pathname.startsWith(`${REVIEW_PATH}/`);
}

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

/* The organizer console's navigation. Desktop gets a slim sticky sidebar;
   below lg it collapses to a sticky top bar with the two sections as a
   segmented row, which fits a 360px screen without scrolling sideways. */
export function OrganizerNav() {
  const pathname = usePathname() ?? "/organizer";

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink/10 bg-paper/80 px-4 py-6 backdrop-blur lg:flex">
        <Link aria-label="HNA home" className={`inline-flex self-start rounded-lg px-2 ${focusRing}`} href="/">
          <BrandLogo />
        </Link>

        <p className="mt-8 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink/55">Organizer console</p>
        <nav aria-label="Organizer navigation" className="mt-2">
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <SidebarLink active={item.isActive(pathname)} item={item} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-ink/10 pt-4">
          <ThemeToggle
            className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-ink/70 hover:bg-ink/5 hover:text-ink ${focusRing}`}
          />
          <Link
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink/70 hover:bg-ink/5 hover:text-ink ${focusRing}`}
            href={APP_HOME}
          >
            <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
            Back to app
          </Link>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/90 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link aria-label="HNA home" className={`inline-flex shrink-0 rounded-lg ${focusRing}`} href="/">
              <BrandLogo />
            </Link>
            <span className="truncate rounded-full border border-ink/15 px-2.5 py-1 text-xs font-semibold text-ink/55">
              Organizer
            </span>
          </div>
          <Link
            aria-label="Back to app"
            className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink/70 hover:bg-ink/5 hover:text-ink ${focusRing}`}
            href={APP_HOME}
            title="Back to app"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </Link>
        </div>
        <nav aria-label="Organizer navigation" className="px-4 pb-3 pt-2">
          <ul className="flex gap-1 rounded-full border border-ink/10 bg-surface p-1">
            {items.map((item) => (
              <li className="min-w-0 flex-1" key={item.href}>
                <TabLink active={item.isActive(pathname)} item={item} />
              </li>
            ))}
          </ul>
        </nav>
      </header>
    </>
  );
}

function SidebarLink({ active, item }: { active: boolean; item: NavItem }) {
  const Icon = item.icon;

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm ${focusRing} ${
        active ? "bg-pine-soft font-semibold text-pine" : "font-medium text-ink/70 hover:bg-ink/5 hover:text-ink"
      }`}
      href={item.href}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {item.label}
    </Link>
  );
}

function TabLink({ active, item }: { active: boolean; item: NavItem }) {
  const Icon = item.icon;

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-sm ${focusRing} ${
        active ? "bg-pine font-semibold text-paper" : "font-medium text-ink/70 hover:bg-ink/5 hover:text-ink"
      }`}
      href={item.href}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
