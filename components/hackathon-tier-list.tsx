"use client";

import Image from "next/image";
import Link from "next/link";

import type { HackathonCardData } from "@/components/hackathon-card";
import { hackathonLogoSrc } from "@/lib/hackathons/logo-hosts";
import { assignTiers } from "@/lib/hackathons/ranking";
import type { TierLabel } from "@/lib/hackathons/ranking";

const TIER_STYLES: Record<TierLabel, string> = {
  S: "bg-gradient-to-b from-[#E8B84B] to-[#B9812B] text-[#2a1c04]",
  A: "bg-pine text-wheat dark:bg-moss dark:text-[#141414]",
  B: "bg-[#5A6CFF] text-white",
  C: "bg-navy/70 text-wheat dark:bg-white/25 dark:text-wheat",
  D: "bg-navy/25 text-navy dark:bg-white/10 dark:text-wheat/80",
};

const TIER_DESCRIPTIONS: Record<TierLabel, string> = {
  S: "Elite — top 1% globally",
  A: "Excellent — next 10%",
  B: "Strong — next 20%",
  C: "Established — next 30%",
  D: "Developing — remaining 39%",
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export function HackathonTierList({ hackathons }: { hackathons: (HackathonCardData & { eloRating: number })[] }) {
  const groups = assignTiers(hackathons).filter((group) => group.hackathons.length > 0);

  if (!groups.length) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div
          className="flex overflow-hidden rounded-2xl border border-navy/10 shadow-[0_10px_30px_-18px_rgba(29,42,68,0.35)] dark:border-white/10"
          key={group.tier}
        >
          <div
            className={`flex w-20 shrink-0 flex-col items-center justify-center gap-1 px-2 py-4 text-center ${TIER_STYLES[group.tier]}`}
          >
            <span className="font-serif text-4xl font-bold leading-none">{group.tier}</span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] opacity-80">
              {group.hackathons.length}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-2 bg-white p-3 dark:bg-[#1b1b1b]">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-navy/40 dark:text-wheat/40">
              {TIER_DESCRIPTIONS[group.tier]}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.hackathons.map((hackathon) => (
                <Link
                  className="group flex w-[8.75rem] flex-col items-center gap-1.5 rounded-xl p-2 text-center transition-colors hover:bg-ivory dark:hover:bg-white/10"
                  href={hackathon.slug ? `/hackathons/${hackathon.slug}` : "#"}
                  key={hackathon.id}
                  title={`${hackathon.name} · ${hackathon.eloRating} confidence-adjusted score`}
                >
                  <div className="grid size-14 place-items-center overflow-hidden rounded-full bg-navy/5 text-sm font-semibold text-navy transition-transform group-hover:scale-105 dark:bg-white/10 dark:text-wheat">
                    {hackathon.image ? (
                      <Image
                        alt=""
                        className="size-full object-cover"
                        height={56}
                        src={hackathonLogoSrc(hackathon.id, hackathon.image)}
                        unoptimized
                        width={56}
                      />
                    ) : (
                      getInitials(hackathon.name) || "HN"
                    )}
                  </div>
                  <span className="line-clamp-2 text-xs font-semibold leading-4 text-navy dark:text-wheat">
                    {hackathon.name}
                  </span>
                  <span className="font-mono text-[10px] text-navy/45 dark:text-wheat/45">{hackathon.eloRating}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
