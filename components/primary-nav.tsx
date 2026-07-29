"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { DiscordIcon } from "@/components/discord-icon";
import { HoverUnderline } from "@/components/hover-underline";

// Near the top of the page the nav always stays put, and a direction flip has
// to clear a few pixels before it counts — otherwise momentum and rubber-band
// scrolling make the bar flicker.
const REVEAL_ZONE = 72;
const DIRECTION_THRESHOLD = 6;

// Hides the nav while scrolling down, brings it back on the first scroll up.
function useHiddenOnScrollDown() {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    lastY.current = Math.max(window.scrollY, 0);

    const update = () => {
      frame.current = null;
      const y = Math.max(window.scrollY, 0);
      const delta = y - lastY.current;

      if (Math.abs(delta) >= DIRECTION_THRESHOLD) {
        setHidden(delta > 0 && y > REVEAL_ZONE);
        lastY.current = y;
      } else if (y <= REVEAL_ZONE) {
        setHidden(false);
      }
    };

    const requestUpdate = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", requestUpdate, { passive: true });

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      if (frame.current !== null) {
        window.cancelAnimationFrame(frame.current);
      }
    };
  }, []);

  return hidden;
}

export function PrimaryNav({ tone = "paper" }: { tone?: "paper" | "pine" }) {
  const hidden = useHiddenOnScrollDown();

  // On the split hero the bar sits seamlessly on the grained pine panel; once
  // scrolled over the paper sheet it reads as a green pill, still legible.
  const dark = tone === "pine";
  const barClassName = dark ? "bg-pine" : "bg-paper";
  const linkColorClassName = dark ? "text-paper" : "text-ink";

  return (
    <header
      // The `!` suffixes let the slide beat the global 160ms color transition
      // that layout.tsx applies to every element.
      className={`pointer-events-none fixed inset-x-0 top-0 z-40 px-4 pt-4 transition-transform! duration-300! ease-out! focus-within:translate-y-0 motion-reduce:transition-none! sm:px-6 sm:pt-5 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <nav
        aria-label="Primary navigation"
        className={`pointer-events-auto mx-auto flex w-full max-w-[1080px] items-center justify-between gap-3 px-3 py-2 sm:gap-4 sm:px-4 sm:py-2.5 ${barClassName}`}
      >
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <Link
            href="/?home"
            className="flex items-center rounded-[9999px] px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
          >
            <span
              className={`text-[0.95rem] font-semibold tracking-tight ${linkColorClassName}`}
            >
              HNA
            </span>
          </Link>

        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            className={`group relative inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.8rem] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine sm:px-5 ${linkColorClassName}`}
            href="/discord"
            rel="noreferrer"
            target="_blank"
          >
            <span className="hidden sm:inline">Join our Discord</span>
            <span className="sm:hidden">Discord</span>
            <DiscordIcon className="h-[0.8rem] w-auto" />
            <HoverUnderline className="inset-x-3.5 bottom-1 sm:inset-x-5" />
          </Link>
          <Link
            className={`group relative rounded-full px-3 py-2 text-[0.8rem] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine sm:px-4 ${linkColorClassName}`}
            href="/about"
          >
            About
            <HoverUnderline className="inset-x-3 bottom-1 sm:inset-x-4" />
          </Link>
          {/* No filled pill: the CTA reads like the other nav links, with the
              shared slide-in underline. */}
          <Link
            className={`group relative rounded-full px-4 py-2 text-[0.8rem] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine sm:px-5 ${linkColorClassName}`}
            href="/hackathons"
          >
            Open App
            <HoverUnderline className="inset-x-4 bottom-1 sm:inset-x-5" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
