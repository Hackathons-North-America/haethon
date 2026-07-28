"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Building2, CalendarDays, CalendarPlus, Inbox, Mail, MessagesSquare, Upload } from "lucide-react";

const items = [
  { href: "/admin/hackathons", icon: CalendarDays, label: "Hackathons" },
  { href: "/admin/hackathons/new", icon: CalendarPlus, label: "Add hackathon" },
  { href: "/admin/submissions", icon: Inbox, label: "Submissions" },
  { href: "/admin/discord", icon: MessagesSquare, label: "Discord" },
  { href: "/admin/organizer-preview", icon: Building2, label: "Organizer view" },
  { href: "/admin/import", icon: Upload, label: "Import" },
  { href: "/admin/broken", icon: AlertTriangle, label: "Broken" },
  { href: "/admin/email-test", icon: Mail, label: "Email test" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-ink/15 bg-paper p-4 lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r lg:p-5">
      <div className="lg:sticky lg:top-5">
        <Link className="text-2xl font-medium tracking-tight text-ink" href="/">
          HNA
        </Link>
        <nav aria-label="Admin navigation" className="mt-6 flex gap-2 lg:flex-col">
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
