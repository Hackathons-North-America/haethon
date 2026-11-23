"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsRight, Maximize2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

/* Notion-style "side peek" for a hackathon's details. Rendered by the
   app/(app)/@panel slot when a client-side link to /hackathons/[slug] is
   intercepted, so the URL is the hackathon's own (shareable, and a reload opens
   the full page) while the catalog or board stays mounted underneath.

   It is a non-modal overlay: fixed to the right edge, no backdrop, the page
   behind keeps scrolling and stays clickable, and the cards' layout never
   shifts. It closes on Esc, the close button, Back, or a click on empty space
   outside it; clicking another hackathon's link swaps the panel's contents. */

const detailPathPattern = /^\/hackathons\/[^/]+$/;

/* True while a hackathon is open in the side panel. Card links use it to
   `replace` rather than push when swapping hackathons, so closing (history
   back) always returns straight to the list instead of the previous peek. */
export function useHackathonPanelOpen() {
  const pathname = usePathname();

  return detailPathPattern.test(pathname ?? "");
}

/* Clicks on these never close the panel: they are controls with their own job
   (another card's link swaps the panel; a status button tracks a hackathon),
   or belong to another dialog layered on top, like the login prompt. */
const keepOpenSelector =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="dialog"], [contenteditable="true"]';

export function HackathonSidePanel({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    closingRef.current = false;
  }, [pathname]);

  /* Move focus into the panel when it opens so keyboard and screen-reader
     users land on it, and hand focus back to whatever opened it on close. */
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    panelRef.current?.focus({ preventScroll: true });

    return () => {
      if (opener?.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  /* A new hackathon starts at the top of the panel, not wherever the last one
     was scrolled to. */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    function close() {
      // Guards against a double back() when Esc and a click land together.
      if (closingRef.current) {
        return;
      }

      closingRef.current = true;
      router.back();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      // Let a dialog stacked above the panel (e.g. the login prompt) handle
      // its own Esc first.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"]') && !panelRef.current?.contains(target)) {
        return;
      }

      close();
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;

      if (!target || panelRef.current?.contains(target) || target.closest(keepOpenSelector)) {
        return;
      }

      close();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [router]);

  const toolbarButtonClassName =
    "grid size-8 place-items-center rounded-md text-ink/55 transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

  return (
    <motion.div
      animate={{ x: 0 }}
      aria-labelledby="hackathon-panel-title"
      className="fixed inset-y-0 right-0 z-[55] flex w-full flex-col border-l border-ink/15 bg-paper shadow-[-16px_0_40px_-16px_rgb(0_0_0/0.22)] outline-none md:w-[40vw] md:min-w-[28rem]"
      initial={prefersReducedMotion ? false : { x: "100%" }}
      ref={panelRef}
      role="dialog"
      tabIndex={-1}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex shrink-0 items-center gap-1 px-3 py-2.5">
        <button
          aria-label="Close panel"
          className={toolbarButtonClassName}
          onClick={() => {
            if (!closingRef.current) {
              closingRef.current = true;
              router.back();
            }
          }}
          title="Close (Esc)"
          type="button"
        >
          <ChevronsRight aria-hidden="true" className="size-[18px]" />
        </button>
        {/* A plain <a>, not <Link>: a client-side link to this URL would be
            intercepted straight back into the panel. The full page load
            renders the real /hackathons/[slug] page. */}
        <a aria-label="Open as full page" className={toolbarButtonClassName} href={pathname} title="Open as full page">
          <Maximize2 aria-hidden="true" className="size-4" />
        </a>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-4 sm:px-10 pb-[calc(4rem+env(safe-area-inset-bottom))]"
        ref={scrollRef}
      >
        {children}
      </div>
    </motion.div>
  );
}

/* Placeholder while the next hackathon's data streams in (loading.tsx). */
export function HackathonSidePanelSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading hackathon" className="animate-pulse motion-reduce:animate-none">
      <div className="flex items-center gap-5">
        <div className="size-16 shrink-0 bg-ink/8" />
        <div className="h-8 w-2/3 bg-ink/8" />
      </div>
      <div className="mt-8 space-y-3 px-2">
        {Array.from({ length: 9 }, (_, index) => (
          <div className="flex gap-4" key={index}>
            <div className="h-4 w-32 shrink-0 bg-ink/6 sm:w-40" />
            <div className="h-4 flex-1 bg-ink/8" />
          </div>
        ))}
      </div>
    </div>
  );
}
