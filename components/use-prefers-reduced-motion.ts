"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);

  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * The visitor's reduced-motion preference, false on the server and during
 * hydration. A few lines of matchMedia, so that pages needing only this
 * answer (the landing page) don't load the animation library for it.
 */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
