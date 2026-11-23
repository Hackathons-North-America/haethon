import { auth } from "@clerk/nextjs/server";

import { AppShellContent, AppShellWipe } from "@/components/app-shell-transition";
import { AppSidebar } from "@/components/app-sidebar";
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
    <div className="relative flex min-h-screen flex-col lg:flex-row">
      <AppSidebar isAdmin={isAdminRole(role)} isOrganizer={role === "organizer"} isSignedIn={Boolean(userId)} />
      <AppShellContent>{children}</AppShellContent>
      {panel}
      <AppShellWipe />
    </div>
  );
}
