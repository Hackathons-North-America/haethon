import { auth } from "@clerk/nextjs/server";

import { AppNavSlotProvider } from "@/components/app-nav-slot";
import { AppShellContent, AppShellWipe } from "@/components/app-shell-transition";
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
        <AppShellContent>{children}</AppShellContent>
        {panel}
        <AppShellWipe />
      </div>
    </AppNavSlotProvider>
  );
}
