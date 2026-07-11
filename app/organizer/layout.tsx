import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { OrganizerSidebar } from "@/components/organizer/organizer-sidebar";
import { getCurrentUserContext, isOrganizerRole } from "@/lib/auth";

export default async function OrganizerLayout({ children }: { children: ReactNode }) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/sign-in");
  }

  if (!isOrganizerRole(context.role)) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[#EFEDEA] text-black lg:flex">
      <OrganizerSidebar />
      <div className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </div>
    </main>
  );
}
