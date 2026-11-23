"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardCheck } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";

const items = [
  { href: "/organizer", icon: CalendarDays, label: "My hackathons" },
  { href: "/organizer/review", icon: ClipboardCheck, label: "Review queue" },
];

export function OrganizerSidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-ink/15 bg-paper p-4 lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r lg:p-5">
      <div className="lg:sticky lg:top-5">
        <Link className="inline-flex" href="/">
          <BrandLogo />
        </Link>
        <nav aria-label="Organizer navigation" className="mt-6 flex gap-2 lg:flex-col">
          {items.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine ${
                  active ? "bg-pine text-paper" : "text-ink/70 hover:bg-ink/10 hover:text-ink"
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
      </div>
    </aside>
  );
}
