"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { ArrowBigDown, ArrowBigUp, Bookmark } from "lucide-react";

type Vote = -1 | 0 | 1;
type Rgb = [number, number, number];

export type HackathonCardData = {
  badges?: string[];
  date: string;
  description: string;
  duration: string;
  id: string;
  image?: string | null;
  isSaved: boolean;
  location: string;
  name: string;
  userVote: Vote;
  voteScore: number;
};

function handleUnauthenticated() {
  window.location.href = "/sign-in";
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

function getGradientStyle(rgb: Rgb) {
  const [r, g, b] = rgb;

  return {
    "--hackathon-accent-rgb": `${r} ${g} ${b}`,
    background: [
      `radial-gradient(circle at 14% 8%, rgba(${r}, ${g}, ${b}, 0.18), transparent 36%)`,
      `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.14), #ffffff 52%, #f7f7f4 100%)`,
    ].join(", "),
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

function useLogoAccentRgb(src: string | null | undefined, fallbackRgb: Rgb) {
  const [sampledColor, setSampledColor] = useState<{ rgb: Rgb; src: string } | null>(null);

  useEffect(() => {
    if (!src) {
      return;
    }

    let canceled = false;
    const image = new window.Image();

    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (canceled) {
        return;
      }

      const prominentColor = findProminentColor(image);
      if (prominentColor) {
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
      className={`absolute bottom-4 right-4 z-10 grid size-10 place-items-center transition-colors hover:text-[#660000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#660000]/35 ${
        saved ? "text-[#660000]" : "text-black"
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
      className="flex h-9 shrink-0 items-center gap-1 text-black"
    >
      <button
        aria-label={`Upvote ${name}`}
        aria-disabled={preview || undefined}
        aria-pressed={vote === 1}
        disabled={savingVote}
        className={`grid size-8 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#660000]/35 ${
          vote === 1 ? "text-[#D9043D]" : "text-[#706F6B]"
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
        className={`grid size-8 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#660000]/35 ${
          vote === -1 ? "text-[#5A6CFF]" : "text-[#706F6B]"
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

function HackathonLogoMark({ hackathon }: { hackathon: HackathonCardData }) {
  return (
    <div className="relative grid size-[4.5rem] shrink-0 place-items-center border border-black/10 bg-white/55 shadow-sm">
      <span
        aria-hidden="true"
        className="absolute -right-px top-2 h-3 border-r border-black/25"
      />
      <span
        aria-hidden="true"
        className="absolute -left-px bottom-2 h-3 border-l border-black/20"
      />
      {hackathon.image ? (
        <Image
          alt={`${hackathon.name} logo`}
          className="object-contain p-2.5"
          fill
          priority={false}
          sizes="72px"
          src={hackathon.image}
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
        className="pointer-events-none absolute right-2 top-2 h-7 w-7 border-r border-t border-black/25"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-4 left-4 h-6 w-6 border-b border-l border-black/10"
      />
    </>
  );
}

export function HackathonCard({
  hackathon,
  preview = false,
}: {
  hackathon: HackathonCardData;
  index: number;
  preview?: boolean;
}) {
  const fallbackRgb = useMemo(() => getFallbackAccentRgb(hackathon.name), [hackathon.name]);
  const accentRgb = useLogoAccentRgb(hackathon.image, fallbackRgb);
  const gradientStyle = useMemo(() => getGradientStyle(accentRgb), [accentRgb]);

  return (
    <article
      className="group relative min-w-0 overflow-hidden border border-black/10 p-5 shadow-[0_18px_45px_rgb(0_0_0/0.06)] sm:p-6"
      style={gradientStyle}
    >
      <CardAccentEdges />

      <div className="flex items-start gap-4">
        <HackathonLogoMark hackathon={hackathon} />
        <div className="min-w-0 pt-1">
          <h2 className="text-xl font-semibold leading-6 text-black sm:text-[1.35rem]">
            {hackathon.name}
          </h2>
          <p className="mt-2 text-[15px] font-semibold leading-5 text-[#706F6B]">
            {hackathon.date}
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-5 text-[#706F6B]">
            {hackathon.location}
          </p>
        </div>
      </div>

      <div className="mt-5 text-base leading-6">
        <p className="line-clamp-3 pr-10 text-[#706F6B]">
          {hackathon.description}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3 pr-10">
          <VoteControl
            hackathonId={hackathon.id}
            initialVote={hackathon.userVote}
            initialVoteScore={hackathon.voteScore}
            name={hackathon.name}
            preview={preview}
          />
        </div>
      </div>
      <BookmarkButton
        hackathonId={hackathon.id}
        hackathonName={hackathon.name}
        initialSaved={hackathon.isSaved}
        preview={preview}
      />
    </article>
  );
}
