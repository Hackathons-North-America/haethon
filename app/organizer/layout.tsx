import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { OrganizerNav } from "@/components/organizer/shell/organizer-nav";
import { getCurrentIdentity, isOrganizerRole } from "@/lib/auth";

export default async function OrganizerLayout({ children }: { children: ReactNode }) {
  const context = await getCurrentIdentity();

  if (!context) {
    redirect("/sign-in");
  }

  if (!isOrganizerRole(context.role)) {
    redirect("/");
  }

  return (
    <div className="relative min-h-screen text-ink lg:flex">
      <OrganizerNav />
      <main className="relative z-10 min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
