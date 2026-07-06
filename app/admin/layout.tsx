import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requireAdminUser } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const gate = await requireAdminUser();

  if (!gate.ok) {
    redirect(gate.reason === "unauthenticated" ? "/sign-in" : "/");
  }

  return (
    <main className="min-h-screen bg-[#EFEDEA] text-black lg:flex">
      <AdminSidebar />
      <div className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </div>
    </main>
  );
}
