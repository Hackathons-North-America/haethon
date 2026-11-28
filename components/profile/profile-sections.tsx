import Image from "next/image";
import { ComponentType } from "react";
import { ArrowUpRight, Globe } from "lucide-react";
import { FaLinkedin } from "react-icons/fa6";
import { SiDevpost, SiGithub, SiInstagram, SiX } from "react-icons/si";

import { getInitials, ProfileSection, ProfileStatusPill } from "@/components/profile/profile-primitives";
import { profileFocusRingClassName, winnerTextClassName } from "@/components/profile/profile-styles";
import { formatDateRange } from "@/lib/hackathons/card-format";
import { hackathonLogoSrc } from "@/lib/hackathons/logo-hosts";
import type { PinnedProfileItem } from "@/lib/profile/profile-page-data";
import { safeExternalUrl } from "@/lib/validations/social";

// Presentational only — no hooks, no client state — so the owner's editable
// account page and the read-only public share page render byte-identical
// markup from the same source.

// Pages import the section shell from here along with the sections; it lives
// in profile-primitives so client components can use it too.
export { ProfileSection };

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;

export type ProfileLink = {
  href: string;
  icon: IconComponent;
  label: string;
  /** Platform name ("GitHub"), used to label icon-only links. */
  platform?: string;
};

export type ProfileSocialValues = {
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  xUrl?: string | null;
  devpostUrl?: string | null;
  portfolioUrl?: string | null;
};

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
    href
      ? [{ href, icon, label: compact ? compactHandle(href, fallback) : labelFromUrl(href), platform: fallback }]
      : []
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink/55">{children}</p>;
}

export function ProfileSkillsSection({ skills, emptyText }: { skills: string[]; emptyText: string }) {
  return (
    <ProfileSection title="Skills">
      {skills.length > 0 ? (
        // Stored skills are already in canonical order, so each language sits
        // next to its own frameworks without needing explicit headers.
        <ul className="flex flex-wrap items-center gap-1.5">
          {skills.map((skill) => (
            <li
              className="inline-flex min-h-8 items-center rounded-full border border-ink/10 bg-surface px-3 text-sm text-ink/80"
              key={skill}
            >
              {skill}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyText>{emptyText}</EmptyText>
      )}
    </ProfileSection>
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
    <ProfileSection aside={items.length ? "Wins & highlights" : undefined} id="pinned" title="Pinned">
      {items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li className="min-w-0" key={item.id}>
              <PinnedHackathonCard item={item} />
            </li>
          ))}
        </ul>
      ) : (
        empty
      )}
    </ProfileSection>
  );
}

function PinnedHackathonCard({ item }: { item: PinnedProfileItem }) {
  const devpostUrl = safeExternalUrl(item.devpostUrl);

  return (
    <article className="flex h-full gap-3.5 rounded-2xl border border-ink/10 bg-surface p-4">
      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-ink/10 bg-paper">
        {item.imageUrl ? (
          <Image
            alt=""
            className="object-cover"
            fill
            sizes="56px"
            src={hackathonLogoSrc(item.hackathonId, item.imageUrl)}
            unoptimized
          />
        ) : (
          // No image: a hackathon-specific initials tile rather than a generic icon.
          <div aria-hidden="true" className="grid size-full place-items-center bg-pine-soft">
            <span className="text-base font-semibold tracking-tight text-pine">
              {getInitials(item.hackathonName) || "HN"}
            </span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate font-semibold text-ink" title={item.hackathonName}>
            {item.hackathonName}
          </h3>
          {item.isWin ? <ProfileStatusPill status="winner" /> : null}
        </div>
        <p className="mt-0.5 text-sm text-ink/55">{formatDateRange(item.startsAt, item.endsAt)}</p>
        <p
          className={`mt-1 line-clamp-2 text-sm ${item.isWin ? `font-medium ${winnerTextClassName}` : "text-ink/70"}`}
        >
          {item.detail}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-ink/55">
          <ProfileStatusPill status={item.tier === "verified" ? "verified" : "self_reported"} />
          {devpostUrl ? (
            <a
              className={`-my-3 inline-flex min-h-11 items-center gap-0.5 rounded-sm font-semibold text-pine hover:underline hover:underline-offset-4 ${profileFocusRingClassName}`}
              href={devpostUrl}
              rel="noreferrer nofollow"
              target="_blank"
            >
              Devpost
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
              <span className="sr-only"> project for {item.hackathonName}</span>
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
