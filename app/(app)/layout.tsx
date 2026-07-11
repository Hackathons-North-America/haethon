import { auth } from "@clerk/nextjs/server";

import { AppSidebar } from "@/components/app-sidebar";
import { getCurrentRole, isAdminRole } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ userId }, role] = await Promise.all([auth(), getCurrentRole()]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-black lg:flex-row">
      <AppSidebar isAdmin={isAdminRole(role)} isOrganizer={role === "organizer"} isSignedIn={Boolean(userId)} />
      <div className="app-shell-content min-w-0 flex-1">{children}</div>
      <div aria-hidden="true" className="app-shell-wipe">
        <span className="app-shell-wipe-label font-mono text-xs font-medium uppercase tracking-[0.3em] text-[#f7f3ea]">
          HNA
        </span>
      </div>
    </div>
  );
}
