"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { DiscordGlyph } from "@/components/discord-glyph";

type MenuItem = { description: string; href: string; label: string };

const DISCORD_INVITE_URL = "https://discord.gg/JHYC8ThcnX";

/* Resources has no page yet, so it points at "#" until it does. */
const plainLinks = [
  { label: "About us", href: "/about" },
  { label: "Resources", href: "#" },
];

const products: MenuItem[] = [
  { label: "Corporate", description: "Sponsor and recruit at hackathons", href: "/corporate" },
  { label: "Organizers", description: "Run check-in and review for your event", href: "/organizer" },
  { label: "Hackers", description: "Find your next event and track it to demo day", href: "/hackathons" },
];

const navText =
  "flex h-10 items-center text-[17px] font-medium text-ink focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink";

/* The Products trigger opens on hover for mouse users and toggles on
   click/tap for everyone; Escape or a click outside closes it. */
function ProductsMenu() {
  const [open, setOpen] = useState(false);
  const openedByHover = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      className="relative"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          openedByHover.current = true;
          setOpen(true);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          openedByHover.current = false;
          setOpen(false);
        }
      }}
      ref={containerRef}
    >
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className={`${navText} gap-1`}
        onClick={() => {
          // A mouse click lands after the hover already opened the menu;
          // toggling then would close it under the cursor, so the first click
          // after a hover-open keeps it open instead.
          if (openedByHover.current) {
            openedByHover.current = false;
            setOpen(true);
            return;
          }

          setOpen((current) => !current);
        }}
        type="button"
      >
        Products
        <ChevronDown
          aria-hidden="true"
          className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          strokeWidth={2.2}
        />
      </button>

      {/* The pt-2 gap is part of the panel's hit area, so the pointer can
          travel from the trigger into the panel without closing it. */}
      <div className={`absolute left-[-1rem] top-full z-50 pt-2 ${open ? "block" : "hidden"}`} id={panelId}>
        <div className="w-80 rounded-2xl border border-ink/[0.06] bg-surface p-2 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.25)]">
          {products.map((item) => (
            <Link
              className="block rounded-xl px-4 py-3 text-left transition-colors hover:bg-ink/[0.04] focus-visible:bg-ink/[0.04] focus-visible:outline-none"
              href={item.href}
              key={item.label}
              onClick={() => setOpen(false)}
            >
              <span className="block text-[15px] font-medium text-ink">{item.label}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink/55">{item.description}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingNav() {
  // Read on the client so the landing pages that use this nav stay static.
  const { isSignedIn } = useAuth();

  return (
    <header className="relative z-40">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-[82px] max-w-[1712px] items-center justify-between px-6"
      >
        <div className="flex items-center">
          {/* "?home" opts out of the proxy's signed-in redirect to /hackathons,
              so the logo always lands on the marketing homepage from here. */}
          <Link
            className="flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            href="/?home"
          >
            <BrandLogo />
          </Link>

          <div className="ml-20 hidden items-center gap-12 lg:flex">
            {plainLinks.map(({ href, label }) => (
              <Link className={navText} href={href} key={label}>
                {label}
              </Link>
            ))}
            <ProductsMenu />
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* The public server invite, so visitors who aren't members yet can
              join. External, so a plain anchor rather than a Link. Below md it
              shrinks to the icon alone. */}
          <a
            aria-label="Join our Discord"
            className="inline-flex size-10 items-center justify-center gap-2 rounded-full text-[17px] font-medium text-ink transition-colors hover:bg-ink/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:w-auto md:px-[15px]"
            href={DISCORD_INVITE_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            <DiscordGlyph className="size-[18px] shrink-0" />
            <span className="hidden md:inline">Join our Discord</span>
          </a>
          {/* Only for visitors Clerk has confirmed are signed out. While Clerk
              is still loading, isSignedIn is undefined and the button stays
              hidden, so signed-in users never see it flash. */}
          {isSignedIn === false ? (
            <Link
              className="hidden h-10 items-center rounded-full border border-ink px-[15px] text-[17px] font-medium text-ink transition-colors hover:bg-ink/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:inline-flex"
              href="/sign-in"
            >
              Sign in
            </Link>
          ) : null}
          <Link
            className="inline-flex h-10 items-center rounded-full bg-ink px-[15px] text-[17px] font-medium text-surface transition-colors hover:bg-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            href="/hackathons"
          >
            Go to app
          </Link>
        </div>
      </nav>
    </header>
  );
}
