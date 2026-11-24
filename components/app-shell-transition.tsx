"use client";

import { useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

function subscribeToNothing() {
  return () => {};
}

/**
 * Whether this mount should play the app shell's entrance (the ink wipe, then
 * the header and content easing in).
 *
 * It plays when the shell arrives with the document: a direct visit or a
 * reload, where it covers the page while the browser is still loading it. It
 * does not play when the shell mounts during a client-side navigation, such
 * as clicking through from the landing page. By then the destination is
 * already in memory, so a 0.8s curtain would be the only thing between the
 * click and the page.
 *
 * The two cases are told apart by how the component first renders: on the
 * server and while hydrating, useSyncExternalStore reads the server snapshot
 * (true); on a client-side mount it reads the client one (false). The answer
 * is kept in state so it doesn't flip to false right after hydration and cut
 * the animation short.
 *
 * The entrance itself is CSS (the shell-intro-* rules in app/globals.css),
 * so it starts with the first paint instead of waiting for this script, and
 * prefers-reduced-motion is honored there as well.
 */
export function useShellIntro() {
  const isDocumentRender = useSyncExternalStore(
    subscribeToNothing,
    () => false,
    () => true
  );
  const [playsIntro] = useState(isDocumentRender);

  return playsIntro;
}

export function AppShellContent({ children }: { children: ReactNode }) {
  const playsIntro = useShellIntro();

  return (
    <div
      // Clears the fixed phone tab bar (3.5rem + home-indicator inset).
      className={`relative z-10 min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0 ${
        playsIntro ? "shell-intro-content" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function AppShellWipe() {
  const playsIntro = useShellIntro();

  if (!playsIntro) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="shell-intro-wipe pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-ink"
      data-shell-wipe=""
    >
      <span className="shell-intro-wipe-label font-mono text-xs font-medium uppercase text-paper">HNA</span>
    </div>
  );
}
