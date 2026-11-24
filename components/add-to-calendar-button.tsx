"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";

import { calendarProviderLinks, type CalendarEvent } from "@/lib/hackathons/calendar-links";

export function AddToCalendarButton(props: CalendarEvent) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointer(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const options = calendarProviderLinks(props);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium text-ink transition-colors hover:bg-pine hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <CalendarDays aria-hidden="true" className="size-4" />
        Add to calendar
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-10 mt-2 min-w-52 border border-ink/10 bg-surface py-1 shadow-lg"
          role="menu"
        >
          {options.map((option) => (
            <a
              className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-ink/70 transition-colors hover:bg-ink/[0.04] hover:text-pine"
              href={option.href}
              key={option.label}
              onClick={() => setOpen(false)}
              rel="noopener noreferrer"
              role="menuitem"
              target="_blank"
            >
              {option.label}
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
