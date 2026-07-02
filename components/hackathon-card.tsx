"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowBigDown, ArrowBigUp, Bookmark } from "lucide-react";

type Vote = -1 | 0 | 1;

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

function BookmarkButton({
  hackathonId,
  hackathonName,
  initialSaved,
}: {
  hackathonId: string;
  hackathonName: string;
  initialSaved: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [saving, setSaving] = useState(false);

  async function toggleSaved() {
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
      aria-pressed={saved}
      disabled={saving}
      className={`absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-white/95 shadow-sm transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
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
}: {
  hackathonId: string;
  initialVote: Vote;
  initialVoteScore: number;
  name: string;
}) {
  const [vote, setVote] = useState<Vote>(initialVote);
  const [score, setScore] = useState(initialVoteScore);
  const [savingVote, setSavingVote] = useState(false);

  async function toggleVote(targetVote: Vote) {
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

function HackathonCoverFallback({ hackathon }: { hackathon: HackathonCardData }) {
  const initials = hackathon.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  return (
    <div className="absolute inset-0 bg-[#EFEDEA]">
      <div className="absolute inset-x-0 top-0 h-1/2 bg-[#660000]" />
      <div className="absolute inset-x-8 bottom-7 top-12 rounded-2xl border border-black/10 bg-white/90 p-5 shadow-sm">
        <div className="grid size-16 place-items-center rounded-2xl bg-black text-xl font-semibold text-white">
          {initials || "HN"}
        </div>
        <p className="mt-5 line-clamp-2 text-xl font-semibold leading-6 text-black">
          {hackathon.name}
        </p>
        <p className="mt-2 truncate text-sm font-semibold text-[#706F6B]">
          {hackathon.location}
        </p>
      </div>
    </div>
  );
}

export function HackathonCard({
  hackathon,
  index,
}: {
  hackathon: HackathonCardData;
  index: number;
}) {
  return (
    <article className="group min-w-0">
      <div className="relative aspect-[1.08] overflow-hidden rounded-[1.35rem] bg-[#F7F7F4]">
        {hackathon.image ? (
          <Image
            alt={`${hackathon.name} venue preview`}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            fill
            priority={index < 3}
            sizes="(min-width: 1024px) 347px, (min-width: 640px) 50vw, 100vw"
            src={hackathon.image}
          />
        ) : (
          <HackathonCoverFallback hackathon={hackathon} />
        )}
        {hackathon.badges?.length ? (
          <ul className="absolute left-3 top-7 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2 overflow-hidden">
            {hackathon.badges.map((badge) => (
              <li
                className="inline-flex max-w-full rounded-full bg-white px-2.5 py-1.5 text-[11px] font-semibold text-black shadow-sm"
                key={badge}
              >
                <span className="truncate">{badge}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <BookmarkButton
          hackathonId={hackathon.id}
          hackathonName={hackathon.name}
          initialSaved={hackathon.isSaved}
        />
      </div>

      <div className="mt-4 text-base leading-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-6 text-black sm:text-[1.35rem]">
              {hackathon.name}
            </h2>
            <p className="mt-1 text-[15px] font-semibold leading-5 text-[#706F6B]">
              {hackathon.location} · {hackathon.date}
            </p>
          </div>
          <VoteControl
            hackathonId={hackathon.id}
            initialVote={hackathon.userVote}
            initialVoteScore={hackathon.voteScore}
            name={hackathon.name}
          />
        </div>
        <p className="mt-3 line-clamp-2 text-[#706F6B]">
          {hackathon.description}
        </p>
        <p className="mt-1 text-[#706F6B]">{hackathon.duration}</p>
      </div>
    </article>
  );
}
