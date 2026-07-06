"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, CalendarDays, ShieldAlert, Upload } from "lucide-react";

const items = [
  { href: "/admin/hackathons", icon: CalendarDays, label: "Hackathons" },
  { href: "/admin/import", icon: Upload, label: "Import" },
  { href: "/admin/broken", icon: AlertTriangle, label: "Broken" },
  { href: "/admin/attendance-anomalies", icon: ShieldAlert, label: "Anomalies" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-black/10 bg-white p-4 lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r lg:p-5">
      <div className="lg:sticky lg:top-5">
        <Link className="font-serif text-2xl font-semibold text-black" href="/">
          Haethon
        </Link>
        <nav aria-label="Admin navigation" className="mt-6 flex gap-2 lg:flex-col">
          {items.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${
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
      </div>
    </aside>
  );
}
