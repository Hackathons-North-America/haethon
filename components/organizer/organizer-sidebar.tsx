"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardCheck } from "lucide-react";

const items = [
  { href: "/organizer", icon: CalendarDays, label: "My hackathons" },
  { href: "/organizer/review", icon: ClipboardCheck, label: "Review queue" },
];

export function OrganizerSidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-navy/10 dark:border-white/10 bg-white/75 backdrop-blur-xl dark:bg-[#141414]/60 p-4 lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r lg:p-5">
      <div className="lg:sticky lg:top-5">
        <Link className="font-serif text-2xl font-semibold text-navy dark:text-wheat" href="/">
          HNA
        </Link>
        <nav aria-label="Organizer navigation" className="mt-6 flex gap-2 lg:flex-col">
          {items.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-semibold transition-colors ${
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
      </div>
    </aside>
  );
}
