import { AppNavSlotProvider } from "@/components/app-nav-slot";
import { AppShellContent, AppShellWipe } from "@/components/app-shell-transition";
import { AppTopNav } from "@/components/app-top-nav";

/* No auth() here on purpose. This layout wraps /hackathons, which is static;
   reading the session in the layout would make every page under it render on
   the server per request. The nav works out who is signed in in the browser
   (components/viewer-auth.tsx), and the pages that need a session check it
   themselves. */
export default function AppLayout({
  children,
  panel,
}: {
  children: React.ReactNode;
  /* The @panel slot: a hackathon's side panel, overlaid on the current page. */
  panel: React.ReactNode;
}) {
  return (
    <AppNavSlotProvider>
      <div className="relative flex min-h-screen flex-col">
        <AppTopNav />
        <AppShellContent>{children}</AppShellContent>
        {panel}
        <AppShellWipe />
      </div>
    </AppNavSlotProvider>
  );
}
