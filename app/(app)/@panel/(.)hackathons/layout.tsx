import type { ReactNode } from "react";

import { HackathonSidePanel } from "@/components/hackathon-side-panel";

/* The panel chrome lives in a layout above [slug] so it stays mounted while
   the user swaps between hackathons: only the contents re-render (behind the
   loading skeleton), and the slide-in plays once on first open. */
export default function HackathonPanelLayout({ children }: { children: ReactNode }) {
  return <HackathonSidePanel>{children}</HackathonSidePanel>;
}
