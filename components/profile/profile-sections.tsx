import Image from "next/image";
import { ComponentType } from "react";
import { CalendarDays, Globe, Trophy } from "lucide-react";
import { FaLinkedin } from "react-icons/fa6";
import { SiDevpost, SiGithub, SiInstagram, SiX } from "react-icons/si";

import { formatDateRange } from "@/lib/hackathons/card-format";
import { hackathonLogoSrc } from "@/lib/hackathons/logo-hosts";
import type { PinnedProfileItem } from "@/lib/profile/profile-page-data";
import { safeExternalUrl } from "@/lib/validations/social";

// Presentational only — no hooks, no client state — so the owner's editable
// account page and the read-only public share page render byte-identical
// markup from the same source.

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;

export type ProfileLink = {
  href: string;
  icon: IconComponent;
  label: string;
};

export type ProfileSocialValues = {
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  xUrl?: string | null;
  devpostUrl?: string | null;
  portfolioUrl?: string | null;
};

export const profileSectionTitleClassName =
  "font-serif text-4xl font-semibold tracking-[-0.035em] text-navy dark:text-wheat sm:text-5xl";

function labelFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

function compactHandle(url: string, fallback: string) {
  try {
    const parsed = new URL(url);
    const handle = parsed.pathname.split("/").filter(Boolean).at(-1);
    return handle ? `/${handle}` : fallback;
  } catch {
    return fallback;
  }
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

/**
 * Turns stored profile URLs into renderable link chips. Anything that isn't a
 * plain http(s) URL is dropped rather than rendered.
 */
export function buildProfileLinks(values: ProfileSocialValues): ProfileLink[] {
  const candidates: { href: string | null; icon: IconComponent; fallback: string; compact: boolean }[] = [
    { href: safeExternalUrl(values.githubUrl), icon: SiGithub, fallback: "GitHub", compact: true },
    { href: safeExternalUrl(values.linkedinUrl), icon: FaLinkedin, fallback: "LinkedIn", compact: true },
    { href: safeExternalUrl(values.instagramUrl), icon: SiInstagram, fallback: "Instagram", compact: true },
    { href: safeExternalUrl(values.xUrl), icon: SiX, fallback: "X", compact: true },
    { href: safeExternalUrl(values.devpostUrl), icon: SiDevpost, fallback: "Devpost", compact: false },
    { href: safeExternalUrl(values.portfolioUrl), icon: Globe, fallback: "Portfolio", compact: false },
  ];

  return candidates.flatMap(({ href, icon, fallback, compact }) =>
    href ? [{ href, icon, label: compact ? compactHandle(href, fallback) : labelFromUrl(href) }] : []
  );
}

export function ProfileSocialsSection({ links, emptyText }: { links: ProfileLink[]; emptyText: string }) {
  return (
    <div className="pb-2 pt-5">
      <h2 className={profileSectionTitleClassName}>Socials</h2>
      {links.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {links.map(({ href, icon: Icon, label }) => (
            <a
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-navy/10 bg-ivory px-3.5 py-2 text-sm text-navy/65 transition hover:border-pine hover:text-pine dark:border-white/10 dark:bg-white/5 dark:text-wheat/65 dark:hover:border-moss/60 dark:hover:text-moss"
              href={href}
              key={href}
              rel="noreferrer nofollow"
              target="_blank"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="break-all">{label}</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-navy/55 dark:text-wheat/55">{emptyText}</p>
      )}
    </div>
  );
}

export function ProfileSkillsSection({ skills, emptyText }: { skills: string[]; emptyText: string }) {
  return (
    <div className="pb-2 pt-16 sm:pt-20">
      <h2 className={profileSectionTitleClassName}>Skills</h2>
      {skills.length > 0 ? (
        // Stored skills are already in canonical order, so each language sits
        // next to its own frameworks without needing explicit headers.
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {skills.map((skill) => (
            <span
              className="inline-flex min-h-10 items-center rounded-full bg-navy px-3.5 py-2 text-sm font-medium text-wheat dark:bg-wheat dark:text-[#141414]"
              key={skill}
            >
              {skill}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-navy/55 dark:text-wheat/55">{emptyText}</p>
      )}
    </div>
  );
}

export function ProfilePinnedSection({
  items,
  empty,
}: {
  items: PinnedProfileItem[];
  empty: React.ReactNode;
}) {
  return (
    <section className="pb-2 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">Pinned</h2>
        <p className="text-sm text-ink/55">Wins &amp; attended events</p>
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        {items.length ? items.map((item) => <PinnedHackathonCard item={item} key={item.id} />) : empty}
      </div>
    </section>
  );
}

function PinnedHackathonCard({ item }: { item: PinnedProfileItem }) {
  const devpostUrl = safeExternalUrl(item.devpostUrl);

  return (
    <article
      className={`flex flex-col overflow-hidden bg-paper ${
        item.isWin ? "border-2 border-pine" : "border border-ink/15"
      }`}
    >
      {/* Big cover image, mirroring the reference listing card. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-paper">
        {item.imageUrl ? (
          <Image
            alt={item.hackathonName}
            className="object-cover"
            fill
            sizes="(min-width: 768px) 400px, 100vw"
            src={hackathonLogoSrc(item.hackathonId, item.imageUrl)}
            unoptimized
          />
        ) : (
          // No cover image: fall back to a hackathon-specific branded tile
          // (initials over the accent gradient) rather than a generic trophy.
          <div className="grid size-full place-items-center bg-[radial-gradient(120%_120%_at_30%_20%,rgba(102,0,0,0.12)_0%,rgba(102,0,0,0.04)_55%,transparent_100%)] dark:bg-[radial-gradient(120%_120%_at_30%_20%,rgba(228,163,171,0.16)_0%,rgba(228,163,171,0.05)_55%,transparent_100%)]">
            <span className="text-4xl font-semibold tracking-tight text-pine dark:text-moss">
              {getInitials(item.hackathonName) || "HN"}
            </span>
          </div>
        )}
        {/* Winner ribbon — makes the win unmistakable. */}
        {item.isWin ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#D4A72C] px-3 py-1.5 text-xs font-bold text-[#3a2c05] shadow-[0_4px_14px_rgba(0,0,0,0.25)]">
            <Trophy aria-hidden="true" className="size-3.5" />
            Winner
          </span>
        ) : null}
        {/* Provenance chip, kept legible over the image. */}
        <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {item.tier === "verified" ? "Verified" : "Self reported"}
        </span>
      </div>

      {/* Text block below the image. */}
      <div className="flex flex-1 flex-col p-4">
        <p className="font-semibold text-navy dark:text-wheat">{item.hackathonName}</p>
        <p className="mt-1 flex items-center gap-1 text-sm text-navy/55 dark:text-wheat/55">
          <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
          <span>{formatDateRange(item.startsAt, item.endsAt)}</span>
        </p>
        {item.isWin ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-[#9a7b1f] dark:text-[#e8c76b]">
            <Trophy aria-hidden="true" className="size-3.5 shrink-0" />
            Won · {item.detail}
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-navy/55 dark:text-wheat/55">{item.detail}</p>
        )}
        {devpostUrl ? (
          <a
            className="mt-3 block truncate text-sm font-semibold text-pine dark:text-moss underline decoration-1 underline-offset-4 hover:no-underline"
            href={devpostUrl}
            rel="noreferrer nofollow"
            target="_blank"
          >
            View on Devpost
          </a>
        ) : null}
      </div>
    </article>
  );
}
