"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CircleUser,
  Compass,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";

const items = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/hackathons", icon: Compass, label: "Hackathons DB" },
  { href: "/my", icon: CalendarDays, label: "My Hackathons" },
  { href: "/account", icon: CircleUser, label: "Hacker Profile" },
];

export function AppSidebar({ isAdmin, isSignedIn }: { isAdmin: boolean; isSignedIn: boolean }) {
  const pathname = usePathname();

  const links = isAdmin ? [...items, { href: "/admin", icon: ShieldCheck, label: "Admin" }] : items;

  return (
    <aside className="app-shell-sidebar z-40 border-b border-black/10 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-4 px-5 pb-0 pt-5 lg:block lg:px-5">
        <Link className="block" href="/">
          <span className="font-serif text-2xl font-semibold leading-none text-black">HNA</span>
        </Link>
        {!isSignedIn ? (
          <Link
            className="inline-flex min-h-9 items-center justify-center border border-[#660000] px-4 font-mono text-xs font-medium uppercase tracking-[0.14em] text-[#660000] transition-colors hover:bg-[#660000] hover:text-white lg:hidden"
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
          const active = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${
                active ? "bg-[#660000] text-white" : "text-[#3F3E3B] hover:bg-[#F7F7F4] hover:text-black"
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

      {!isSignedIn ? (
        <div className="hidden px-5 pb-6 lg:absolute lg:bottom-0 lg:left-0 lg:right-0 lg:block">
          <Link
            className="inline-flex min-h-10 w-full items-center justify-center border border-[#660000] px-4 font-mono text-xs font-medium uppercase tracking-[0.14em] text-[#660000] transition-colors hover:bg-[#660000] hover:text-white"
            href="/sign-in"
          >
            Login
          </Link>
        </div>
      ) : null}
    </aside>
  );
}
