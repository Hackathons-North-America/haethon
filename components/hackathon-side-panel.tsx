"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsRight, Maximize2, Minimize2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

/* Notion-style "side peek" for a hackathon's details. Rendered by the
   app/(app)/@panel slot when a client-side link to /hackathons/[slug] is
   intercepted, so the URL is the hackathon's own (shareable, and a reload opens
   the full page) while the catalog or board stays mounted underneath.

   It is a non-modal overlay: fixed to the right edge, no backdrop, the page
   behind keeps scrolling and stays clickable, and the cards' layout never
   shifts. It closes on Esc, the close button, Back, or a click on empty space
   outside it (sliding back out to the right); clicking another hackathon's
   link swaps the panel's contents. The expand button grows it to fill the
   viewport in place, reusing the already-loaded contents, so there is no page
   load; reloading the URL still gives the real full page. */

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
  const [expanded, setExpanded] = useState(false);
  /* The path a close was requested on. Comparing it to the current path (not
     a boolean) means that if Back lands on another hackathon and the panel
     stays mounted, it stops counting as closing and slides back in. */
  const [closingPath, setClosingPath] = useState<string | null>(null);
  const closing = closingPath !== null && closingPath === pathname;

  useEffect(() => {
    closingRef.current = false;
  }, [pathname]);

  /* Slide out first, then leave the route (onAnimationComplete below): the
     slot unmounts the panel as soon as the URL changes, so there would be
     nothing left to animate afterwards. */
  const close = useCallback(() => {
    // Guards against a double back() when Esc and a click land together.
    if (closingRef.current) {
      return;
    }

    closingRef.current = true;

    if (prefersReducedMotion) {
      router.back();
    } else {
      setClosingPath(pathname);
    }
  }, [pathname, prefersReducedMotion, router]);

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
  }, [close]);

  const toolbarButtonClassName =
    "grid size-8 place-items-center rounded-md text-ink/55 transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

  return (
    <motion.div
      animate={{ x: closing ? "100%" : 0 }}
      aria-labelledby="hackathon-panel-title"
      /* Width is a CSS transition rather than a motion layout animation, which
         would scale the text mid-flight. Phones are always full width, so the
         expand toggle is hidden there. */
      className={`fixed inset-y-0 right-0 z-[55] flex w-full flex-col border-l border-ink/15 bg-paper shadow-[-16px_0_40px_-16px_rgb(0_0_0/0.22)] outline-none transition-[width,min-width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        expanded ? "md:w-full md:min-w-0" : "md:w-[40vw] md:min-w-[28rem]"
      }`}
      initial={prefersReducedMotion ? false : { x: "100%" }}
      onAnimationComplete={() => {
        if (closing) {
          router.back();
        }
      }}
      ref={panelRef}
      role="dialog"
      tabIndex={-1}
      transition={closing ? { duration: 0.24, ease: [0.4, 0, 1, 1] } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex shrink-0 items-center gap-1 px-3 py-2.5">
        <button aria-label="Close panel" className={toolbarButtonClassName} onClick={close} title="Close (Esc)" type="button">
          <ChevronsRight aria-hidden="true" className="size-[18px]" />
        </button>
        <button
          aria-label={expanded ? "Collapse to side panel" : "Expand to full screen"}
          aria-pressed={expanded}
          className={`${toolbarButtonClassName} max-md:hidden`}
          onClick={() => setExpanded((value) => !value)}
          title={expanded ? "Collapse to side panel" : "Expand to full screen"}
          type="button"
        >
          {expanded ? (
            <Minimize2 aria-hidden="true" className="size-4" />
          ) : (
            <Maximize2 aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-4 sm:px-10 pb-[calc(4rem+env(safe-area-inset-bottom))]"
        ref={scrollRef}
      >
        {/* Expanded, the contents keep the full page's reading width. */}
        <div className={expanded ? "mx-auto w-full max-w-[860px]" : undefined}>{children}</div>
      </div>
    </motion.div>
  );
}
