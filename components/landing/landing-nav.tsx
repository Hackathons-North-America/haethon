"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { DiscordGlyph } from "@/components/discord-glyph";

type MenuItem = { description: string; href: string; label: string };

/* About us and Resources have no pages yet, so they point at "#" until they
   do. */
const plainLinks = [
  { label: "About us", href: "#" },
  { label: "Resources", href: "#" },
];

const products: MenuItem[] = [
  { label: "Corporate", description: "Sponsor and recruit at hackathons", href: "/corporate" },
  { label: "Organizers", description: "Run check-in and review for your event", href: "/organizer" },
  { label: "Hackers", description: "Find your next event and track it to demo day", href: "/hackathons" },
];

const navText =
  "flex h-10 items-center text-[17px] font-medium text-black focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black";

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
        <div className="w-80 rounded-2xl border border-black/[0.06] bg-white p-2 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.25)]">
          {products.map((item) => (
            <Link
              className="block rounded-xl px-4 py-3 text-left transition-colors hover:bg-black/[0.04] focus-visible:bg-black/[0.04] focus-visible:outline-none"
              href={item.href}
              key={item.label}
              onClick={() => setOpen(false)}
            >
              <span className="block text-[15px] font-medium text-black">{item.label}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-black/55">{item.description}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingNav() {
  return (
    <header className="relative z-40">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-[82px] max-w-[1712px] items-center justify-between px-6"
      >
        <div className="flex items-center">
          {/* Same "HNA" wordmark as the app's top nav, with the beaver beside
              it. The SVG serves as-is (Next skips optimization for .svg). */}
          <Link
            className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
            href="/"
          >
            <Image alt="" className="h-8 w-auto" height={677} priority src="/logo-beaver.svg" width={613} />
            <span className="whitespace-nowrap text-2xl font-semibold leading-none tracking-tight text-ink">HNA</span>
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
          {/* /discord is a route handler that redirects to the server invite,
              so this is a plain anchor rather than a Link. Below md it shrinks
              to the icon alone. */}
          <a
            aria-label="Join our Discord"
            className="inline-flex size-10 items-center justify-center gap-2 rounded-full text-[17px] font-medium text-black transition-colors hover:bg-black/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black md:w-auto md:px-[15px]"
            href="/discord"
          >
            <DiscordGlyph className="size-[18px] shrink-0" />
            <span className="hidden md:inline">Join our Discord</span>
          </a>
          <Link
            className="hidden h-10 items-center rounded-full border border-black px-[15px] text-[17px] font-medium text-black transition-colors hover:bg-black/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black sm:inline-flex"
            href="/sign-in"
          >
            Sign in
          </Link>
          <Link
            className="inline-flex h-10 items-center rounded-full bg-black px-[15px] text-[17px] font-medium text-white transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
            href="/hackathons"
          >
            Go to app
          </Link>
        </div>
      </nav>
    </header>
  );
}
