"use client";

import { usePathname } from "next/navigation";

/* Lives apart from hackathon-side-panel.tsx on purpose. Every hackathon card
   calls this hook, and importing it from the panel's module would pull the
   panel (and the animation library it uses) into the JavaScript needed to show
   the catalog, when the panel itself only loads once a hackathon is opened. */

const detailPathPattern = /^\/hackathons\/[^/]+$/;

/* True while a hackathon is open in the side panel. Card links use it to
   `replace` rather than push when swapping hackathons, so closing (history
   back) always returns straight to the list instead of the previous peek. */
export function useHackathonPanelOpen() {
  const pathname = usePathname();

  return detailPathPattern.test(pathname ?? "");
}
