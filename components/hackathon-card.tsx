"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowBigDown, ArrowBigUp, BellPlus, Bookmark } from "lucide-react";

import { DiscordGlyph } from "@/components/discord-glyph";

type Vote = -1 | 0 | 1;
type Rgb = [number, number, number];

export type HackathonCardData = {
  badges?: string[];
  country?: string | null;
  date: string;
  description: string;
  duration: string;
  hasDiscord?: boolean;
  id: string;
  image?: string | null;
  isSaved: boolean;
  location: string;
  name: string;
  slug?: string | null;
  userVote: Vote;
  voteScore: number;
  websiteUrl?: string | null;
};

function handleUnauthenticated() {
  window.location.href = "/sign-in";
}

/* Map a full country name to a short code plus the accent used to underline it.
   US flips blue, Canada red; every other country keeps the muted body color. */
const COUNTRY_SHORT_FORMS: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  canada: "CA",
  "united kingdom": "UK",
  germany: "DE",
  france: "FR",
  india: "IN",
  australia: "AU",
  singapore: "SG",
  netherlands: "NL",
  spain: "ES",
  japan: "JP",
  china: "CN",
  brazil: "BR",
  mexico: "MX",
};

function getCountryShortForm(country: string): { code: string; underlineClass: string } {
  const key = country.trim().toLowerCase();
  const code = COUNTRY_SHORT_FORMS[key] ?? country.trim().toUpperCase();

  if (key === "united states" || key === "united states of america" || key === "usa") {
    return { code: "US", underlineClass: "underline decoration-[#5A6CFF] underline-offset-2" };
  }

  if (key === "canada") {
    return { code: "CA", underlineClass: "underline decoration-[#D9043D] underline-offset-2" };
  }

  return { code, underlineClass: "" };
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function getFallbackAccentRgb(name: string): Rgb {
  const palette: Rgb[] = [
    [102, 0, 0],
    [217, 4, 61],
    [31, 93, 135],
    [24, 120, 92],
    [138, 83, 18],
    [86, 64, 148],
    [160, 62, 43],
  ];
  const hash = Array.from(name).reduce((total, character) => total + character.charCodeAt(0), 0);

  return palette[hash % palette.length] ?? palette[0];
}

/* Pull every accent into a common band so no single logo reads louder than the
   rest. Capping luminance alone doesn't work: the luminance formula scores red
   very low, so saturated reds/oranges slip under any cap and still shout. We
   instead cap both lightness and saturation in HSL — keeping the hue, so a
   bright or vivid color becomes a deep, muted version of itself while an
   already-calm color is barely touched. */
const MAX_ACCENT_LIGHTNESS = 0.32;
const MAX_ACCENT_SATURATION = 0.5;

function rgbToHsl(rgb: Rgb): [number, number, number] {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return [0, 0, lightness];
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;

  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  hue *= 60;
  if (hue < 0) {
    hue += 360;
  }

  return [hue, saturation, lightness];
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (hue < 60) {
    [rp, gp, bp] = [c, x, 0];
  } else if (hue < 120) {
    [rp, gp, bp] = [x, c, 0];
  } else if (hue < 180) {
    [rp, gp, bp] = [0, c, x];
  } else if (hue < 240) {
    [rp, gp, bp] = [0, x, c];
  } else if (hue < 300) {
    [rp, gp, bp] = [x, 0, c];
  } else {
    [rp, gp, bp] = [c, 0, x];
  }

  return [
    Math.round((rp + m) * 255),
    Math.round((gp + m) * 255),
    Math.round((bp + m) * 255),
  ];
}

function normalizeAccentRgb(rgb: Rgb): Rgb {
  const [hue, saturation, lightness] = rgbToHsl(rgb);

  return hslToRgb(
    hue,
    Math.min(saturation, MAX_ACCENT_SATURATION),
    Math.min(lightness, MAX_ACCENT_LIGHTNESS),
  );
}

/* The aurora surface itself lives in globals.css (.hackathon-card-aurora),
   keyed off this accent variable so it can flip with the theme. */
function getAccentStyle(rgb: Rgb) {
  const [r, g, b] = normalizeAccentRgb(rgb);

  return {
    "--hackathon-accent-rgb": `${r} ${g} ${b}`,
  } as CSSProperties & { "--hackathon-accent-rgb": string };
}

function findProminentColor(image: HTMLImageElement): Rgb | null {
  const canvas = document.createElement("canvas");
  const size = 32;
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  try {
    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const buckets = new Map<string, { b: number; count: number; g: number; r: number; score: number }>();

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      if (alpha < 0.45) {
        continue;
      }

      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      if (luminance > 245 || luminance < 12 || (saturation < 0.12 && (luminance > 210 || luminance < 45))) {
        continue;
      }

      const bucketR = Math.round(r / 32) * 32;
      const bucketG = Math.round(g / 32) * 32;
      const bucketB = Math.round(b / 32) * 32;
      const key = `${bucketR},${bucketG},${bucketB}`;
      const score = alpha * (0.55 + saturation) * (luminance > 225 ? 0.45 : 1);
      const bucket = buckets.get(key) ?? { b: 0, count: 0, g: 0, r: 0, score: 0 };

      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
      bucket.score += score;
      buckets.set(key, bucket);
    }

    const best = Array.from(buckets.values()).sort((a, b) => b.score - a.score)[0];
    if (!best) {
      return null;
    }

    return [
      Math.round(best.r / best.count),
      Math.round(best.g / best.count),
      Math.round(best.b / best.count),
    ];
  } catch {
    return null;
  }
}

/* Session-wide accent cache so each logo is decoded and sampled at most once,
   no matter how often cards remount across pages. */
const accentCache = new Map<string, Rgb>();

function useLogoAccentRgb(src: string | null | undefined, fallbackRgb: Rgb) {
  const [sampledColor, setSampledColor] = useState<{ rgb: Rgb; src: string } | null>(() => {
    const cached = src ? accentCache.get(src) : undefined;

    return cached && src ? { rgb: cached, src } : null;
  });

  useEffect(() => {
    if (!src || accentCache.has(src)) {
      return;
    }

    let canceled = false;
    const image = new window.Image();

    /* Same-origin proxy URLs don't need CORS; absolute URLs do, or the
       canvas is tainted and getImageData throws. */
    if (!src.startsWith("/")) {
      image.crossOrigin = "anonymous";
    }
    image.decoding = "async";
    image.onload = () => {
      if (canceled) {
        return;
      }

      const prominentColor = findProminentColor(image);
      if (prominentColor) {
        accentCache.set(src, prominentColor);
        setSampledColor({ rgb: prominentColor, src });
      }
    };
    image.src = src;

    return () => {
      canceled = true;
    };
  }, [src]);

  if (sampledColor && sampledColor.src === src) {
    return sampledColor.rgb;
  }

  return fallbackRgb;
}

function BookmarkButton({
  hackathonId,
  hackathonName,
  initialSaved,
  preview = false,
}: {
  hackathonId: string;
  hackathonName: string;
  initialSaved: boolean;
  preview?: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [saving, setSaving] = useState(false);

  async function toggleSaved() {
    if (preview) {
      return;
    }

    const nextSaved = !saved;
    const previousSaved = saved;

    setSaved(nextSaved);
    setSaving(true);

    try {
      const response = await fetch(`/api/hackathons/${encodeURIComponent(hackathonId)}/save`, {
        body: JSON.stringify({ isSaved: nextSaved }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      if (!response.ok) {
        throw new Error("Could not save hackathon.");
      }

      const payload = (await response.json()) as { data?: { isSaved?: boolean } };
      setSaved(Boolean(payload.data?.isSaved));
    } catch {
      setSaved(previousSaved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      aria-label={`${saved ? "Remove" : "Add"} ${hackathonName} ${
        saved ? "from" : "to"
      } library`}
      aria-disabled={preview || undefined}
      aria-pressed={saved}
      disabled={saving}
      className={`relative z-10 grid size-10 shrink-0 place-items-center transition-colors hover:text-cabernet dark:hover:text-[#e4a3ab] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
        saved ? "text-cabernet dark:text-[#e4a3ab]" : "text-navy dark:text-wheat"
      } disabled:cursor-wait disabled:opacity-70`}
      onClick={toggleSaved}
      type="button"
    >
      <Bookmark
        aria-hidden="true"
        className={`size-5 ${saved ? "fill-current" : "fill-transparent"}`}
        strokeWidth={2.35}
      />
    </button>
  );
}

function VoteControl({
  hackathonId,
  initialVote,
  initialVoteScore,
  name,
  preview = false,
}: {
  hackathonId: string;
  initialVote: Vote;
  initialVoteScore: number;
  name: string;
  preview?: boolean;
}) {
  const [vote, setVote] = useState<Vote>(initialVote);
  const [score, setScore] = useState(initialVoteScore);
  const [savingVote, setSavingVote] = useState(false);

  async function toggleVote(targetVote: Vote) {
    if (preview) {
      return;
    }

    const nextVote = vote === targetVote ? 0 : targetVote;
    const previousVote = vote;
    const previousScore = score;

    setVote(nextVote);
    setScore((current) => current + nextVote - previousVote);
    setSavingVote(true);

    try {
      const response = await fetch(`/api/hackathons/${encodeURIComponent(hackathonId)}/vote`, {
        body: JSON.stringify({ vote: nextVote }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      if (!response.ok) {
        throw new Error("Could not vote on hackathon.");
      }

      const payload = (await response.json()) as { data?: { score?: number; vote?: Vote } };
      setVote(payload.data?.vote ?? nextVote);
      setScore(payload.data?.score ?? previousScore + nextVote - previousVote);
    } catch {
      setVote(previousVote);
      setScore(previousScore);
    } finally {
      setSavingVote(false);
    }
  }

  return (
    <div
      aria-label={`${name} community score`}
      className="relative z-10 flex h-9 shrink-0 items-center gap-1 text-navy dark:text-wheat"
    >
      <button
        aria-label={`Upvote ${name}`}
        aria-disabled={preview || undefined}
        aria-pressed={vote === 1}
        disabled={savingVote}
        className={`grid size-8 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
          vote === 1 ? "text-cabernet dark:text-[#e4a3ab]" : "text-navy/55 dark:text-wheat/55"
        } disabled:cursor-wait disabled:opacity-70`}
        onClick={() => toggleVote(1)}
        type="button"
      >
        <ArrowBigUp
          aria-hidden="true"
          className={`size-5 ${vote === 1 ? "fill-current" : ""}`}
          strokeWidth={2}
        />
      </button>
      <span className="min-w-7 text-center text-lg font-semibold leading-none">
        {score}
      </span>
      <button
        aria-label={`Downvote ${name}`}
        aria-disabled={preview || undefined}
        aria-pressed={vote === -1}
        disabled={savingVote}
        className={`grid size-8 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 ${
          vote === -1 ? "text-[#5A6CFF]" : "text-navy/55 dark:text-wheat/55"
        } disabled:cursor-wait disabled:opacity-70`}
        onClick={() => toggleVote(-1)}
        type="button"
      >
        <ArrowBigDown
          aria-hidden="true"
          className={`size-5 ${vote === -1 ? "fill-current" : ""}`}
          strokeWidth={2}
        />
      </button>
    </div>
  );
}

function HackathonLogoMark({
  hackathon,
  logoSrc,
}: {
  hackathon: HackathonCardData;
  logoSrc: string | null;
}) {
  return (
    <div className="relative grid size-[4.5rem] shrink-0 place-items-center overflow-hidden rounded-xl bg-[radial-gradient(120%_120%_at_30%_20%,#d9c3a5_0%,#c4a882_55%,#b0946a_100%)]">
      {logoSrc ? (
        <Image
          alt={`${hackathon.name} logo`}
          className="object-contain"
          fill
          priority={false}
          sizes="72px"
          src={logoSrc}
          unoptimized
        />
      ) : (
        <div className="grid size-full place-items-center bg-[rgb(var(--hackathon-accent-rgb)/0.92)] px-2 text-center text-lg font-semibold text-white">
          {getInitials(hackathon.name) || "HN"}
        </div>
      )}
    </div>
  );
}

function CardAccentEdges() {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-2 h-7 w-7 border-r border-t border-navy/25 dark:border-white/25"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-4 left-4 h-6 w-6 border-b border-l border-navy/10 dark:border-white/10"
      />
    </>
  );
}

export function HackathonCard({
  hackathon,
  preview = false,
  reminderHref,
}: {
  hackathon: HackathonCardData;
  index: number;
  preview?: boolean;
  /* When set, the footer swaps the vote/save controls for an Add Reminder
     link opening this href in a new tab — used on the My Hackathons board. */
  reminderHref?: string;
}) {
  const fallbackRgb = useMemo(() => getFallbackAccentRgb(hackathon.name), [hackathon.name]);
  /* Logos are served through our own origin so their pixels stay readable on
     canvas — most logo CDNs don't send CORS headers, which used to force the
     card back to the name-hash accent. Previews aren't in the DB yet, so they
     keep the raw URL. */
  const logoSrc = hackathon.image
    ? preview
      ? hackathon.image
      : `/api/hackathons/${encodeURIComponent(hackathon.id)}/logo`
    : null;
  const accentRgb = useLogoAccentRgb(logoSrc, fallbackRgb);
  const accentStyle = useMemo(() => getAccentStyle(accentRgb), [accentRgb]);

  return (
    <article
      className="hackathon-card-aurora group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-navy/10 dark:border-white/10 p-5 shadow-[0_18px_45px_rgb(0_0_0/0.06)] dark:shadow-[0_18px_45px_rgb(0_0_0/0.5)] transition-transform duration-200 ease-out hover:z-10 hover:scale-105 sm:p-6"
      style={accentStyle}
    >
      {hackathon.slug && !preview ? (
        <Link
          aria-label={`View ${hackathon.name} details`}
          className="absolute inset-0 z-[1]"
          href={`/hackathons/${hackathon.slug}`}
        />
      ) : hackathon.websiteUrl && !preview ? (
        <a
          aria-label={`Visit ${hackathon.name} website`}
          className="absolute inset-0 z-[1]"
          href={hackathon.websiteUrl}
          rel="noopener noreferrer"
          target="_blank"
        />
      ) : null}
      {/* Film grain keeps the aurora tactile, matching the hero. */}
      <span
        aria-hidden="true"
        className="hero-grain pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay dark:opacity-[0.09]"
      />
      <CardAccentEdges />

      <div className="flex items-start gap-4">
        <HackathonLogoMark hackathon={hackathon} logoSrc={logoSrc} />
        <div className="min-w-0 pt-1">
          <h2 className="line-clamp-2 text-xl font-semibold leading-6 text-navy dark:text-wheat sm:text-[1.35rem]">
            {hackathon.name}
          </h2>
          <p className="mt-2 text-[15px] font-semibold leading-5 text-navy/55 dark:text-wheat/55">
            {hackathon.date}
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-5 text-navy/55 dark:text-wheat/55">
            {hackathon.location}
            {hackathon.country
              ? (() => {
                  const { code, underlineClass } = getCountryShortForm(hackathon.country);

                  return (
                    <>
                      {", "}
                      <span className={underlineClass}>{code}</span>
                    </>
                  );
                })()
              : null}
          </p>
          {hackathon.hasDiscord ? (
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#5865F2]">
              <DiscordGlyph className="size-3.5" />
              Discord
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-auto pt-5 text-base leading-6">
        {reminderHref ? (
          <Link
            className="relative z-10 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full border border-cabernet dark:border-[#e4a3ab]/50 px-5 text-sm font-semibold text-cabernet dark:text-[#e4a3ab] transition-colors hover:bg-cabernet hover:text-wheat dark:hover:bg-[#e4a3ab]/10 dark:hover:text-[#e4a3ab] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40"
            href={reminderHref}
            target="_blank"
          >
            <BellPlus aria-hidden="true" className="size-4" />
            Add Reminder
          </Link>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <VoteControl
              hackathonId={hackathon.id}
              initialVote={hackathon.userVote}
              initialVoteScore={hackathon.voteScore}
              name={hackathon.name}
              preview={preview}
            />
            <BookmarkButton
              hackathonId={hackathon.id}
              hackathonName={hackathon.name}
              initialSaved={hackathon.isSaved}
              preview={preview}
            />
          </div>
        )}
      </div>
    </article>
  );
}
