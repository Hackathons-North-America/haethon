"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { DiscordIcon } from "@/components/discord-icon";
import { HoverUnderline } from "@/components/hover-underline";
import { LoginRequiredLink } from "@/components/login-required-dialog";

/* The same grain as the hero's espresso panel — which in turn is the
   hackathon cards' streak noise — so the dark bar reads as one continuous
   textured surface with the panel below it. */
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='3' intercept='-1'/%3E%3CfeFuncG type='linear' slope='3' intercept='-1'/%3E%3CfeFuncB type='linear' slope='3' intercept='-1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")";

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

export function PrimaryNav({ tone = "paper" }: { tone?: "paper" | "bark" }) {
  const hidden = useHiddenOnScrollDown();

  // On the split hero the bar shares the grained espresso surface of the
  // panel below it, ruled off in cream; on paper pages it reads as a plain
  // ruled paper strip.
  const dark = tone === "bark";
  const barClassName = dark
    ? "bg-bark border-paper/60"
    : "bg-paper border-black";
  const linkColorClassName = dark ? "text-paper" : "text-ink";

  // The CTA pill is filled cream on the espresso bar — the same reversal the
  // hero's own CTA uses — and stays green on paper pages, where cream on cream
  // would vanish.
  const ctaFillClassName = dark
    ? "bg-paper text-ink hover:bg-white"
    : "bg-pine text-paper hover:bg-moss";

  // Pine is the espresso brown of the bar itself, so a pine focus ring would
  // vanish on the dark tone — reverse it to cream there.
  const focusRingClassName = dark
    ? "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
    : "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

  // The centered marketing links, set in the reference layout's voice: plain
  // medium text with the shared slide-in underline on hover.
  const centerLinkClassName = `group relative inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.9rem] font-medium ${focusRingClassName} ${linkColorClassName}`;

  return (
    <header
      // Full-bleed bar, flush to the top edge — no floating gap. The `!`
      // suffixes let the slide beat the global 160ms color transition that
      // layout.tsx applies to every element.
      className={`fixed inset-x-0 top-0 z-40 transition-transform! duration-300! ease-out! focus-within:translate-y-0 motion-reduce:transition-none! ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <nav
        aria-label="Primary navigation"
        className={`relative grid w-full grid-cols-[1fr_auto] items-center gap-3 border-b px-5 py-3 sm:px-8 lg:grid-cols-[1fr_auto_1fr] ${barClassName}`}
      >
        {/* On the dark bar, the hero panel's grain continues across the nav at
            the same tile size and strength so the two read as one surface. */}
        {dark ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-70 mix-blend-overlay"
            style={
              {
                backgroundImage: GRAIN_URI,
                backgroundSize: "140px 140px",
              } as CSSProperties
            }
          />
        ) : null}

        {/* Left: the wordmark, sized like the reference's masthead. */}
        <Link
          href="/?home"
          className={`relative justify-self-start rounded-sm px-1 py-1 ${focusRingClassName}`}
        >
          <span
            className={`text-2xl font-bold leading-none tracking-[-0.01em] ${linkColorClassName}`}
          >
            HNA
          </span>
        </Link>

        {/* Center: the marketing links. */}
        <div className="relative hidden items-center gap-1 lg:flex">
          <Link className={centerLinkClassName} href="/#coverage">
            Why HNA
            <HoverUnderline className="inset-x-3.5 bottom-1" />
          </Link>
          <LoginRequiredLink className={centerLinkClassName} forcePrompt href="/organizer">
            Resources
            <HoverUnderline className="inset-x-3.5 bottom-1" />
          </LoginRequiredLink>
          <Link className={centerLinkClassName} href="/about">
            About
            <HoverUnderline className="inset-x-3.5 bottom-1" />
          </Link>
          <Link
            className={centerLinkClassName}
            href="/discord"
            rel="noreferrer"
            target="_blank"
          >
            Join our Discord
            <DiscordIcon className="h-[0.8rem] w-auto" />
            <HoverUnderline className="inset-x-3.5 bottom-1" />
          </Link>
        </div>

        {/* Right: Discord shortcut below lg, then the CTA — the reference's
            filled pill with a black frame. */}
        <div className="relative flex items-center gap-2 justify-self-end sm:gap-3">
          <Link
            aria-label="Join our Discord"
            className={`grid size-9 place-items-center rounded-full ${focusRingClassName} lg:hidden ${linkColorClassName}`}
            href="/discord"
            rel="noreferrer"
            target="_blank"
          >
            <DiscordIcon className="h-[0.85rem] w-auto" />
          </Link>
          <Link
            // `leading-5` is load-bearing beyond typography: this pill is the
            // bar's tallest child, so its height sets the nav's. At 0.85rem the
            // default 1.5 leading gives 20.4px, landing the bar's bottom border
            // on a half device-pixel, where the 1px rule smears across three
            // rows and reads thicker than the hero's hairlines. An integer
            // line-height keeps the border crisp at the same weight as them.
            className={`rounded-md border border-black px-4 py-2 text-[0.85rem] font-medium leading-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper sm:px-5 sm:py-2.5 ${ctaFillClassName}`}
            href="/hackathons"
          >
            Open App
          </Link>
        </div>
      </nav>
    </header>
  );
}
