"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";

type Props = {
  title: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  location?: string | null;
  description?: string | null;
  url?: string | null;
};

// Compact UTC form used by Google Calendar: YYYYMMDDTHHMMSSZ
function toCompactUtc(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildDetails({ description, url }: Pick<Props, "description" | "url">) {
  return [description?.trim(), url ? `More info: ${url}` : null].filter(Boolean).join("\n\n");
}

function googleUrl({ title, startsAt, endsAt, location, description, url }: Props) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toCompactUtc(startsAt)}/${toCompactUtc(endsAt)}`,
    details: buildDetails({ description, url }),
    location: location ?? "",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookUrl({ title, startsAt, endsAt, location, description, url }: Props) {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title,
    startdt: new Date(startsAt).toISOString(),
    enddt: new Date(endsAt).toISOString(),
    body: buildDetails({ description, url }),
    location: location ?? "",
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function AddToCalendarButton(props: Props) {
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

  const options = [
    { label: "Google Calendar", href: googleUrl(props) },
    { label: "Outlook", href: outlookUrl(props) },
  ];

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
          className="absolute left-0 top-full z-10 mt-2 min-w-52 border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] py-1 shadow-lg"
          role="menu"
        >
          {options.map((option) => (
            <a
              className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-navy/70 dark:text-wheat/70 transition-colors hover:bg-[#F5F1EC] hover:text-pine dark:hover:text-moss"
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
