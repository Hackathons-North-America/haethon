import { auth } from "@clerk/nextjs/server";

import { AppNavSlotProvider } from "@/components/app-nav-slot";
import { AppTopNav } from "@/components/app-top-nav";
import { isAdminRole, roleFromSessionClaims } from "@/lib/auth";

export default async function AppLayout({
  children,
  panel,
}: {
  children: React.ReactNode;
  /* The @panel slot: a hackathon's side panel, overlaid on the current page. */
  panel: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();
  const role = roleFromSessionClaims(sessionClaims);

  return (
    <AppNavSlotProvider>
      <div className="relative flex min-h-screen flex-col">
        <AppTopNav isAdmin={isAdminRole(role)} isOrganizer={role === "organizer"} isSignedIn={Boolean(userId)} />
        {/* Clears the fixed phone tab bar (3.5rem + home-indicator inset). */}
        <div className="relative z-10 min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>
        {panel}
      </div>
    </AppNavSlotProvider>
  );
}
