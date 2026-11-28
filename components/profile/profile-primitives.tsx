import { BadgeCheck, Trophy } from "lucide-react";

import { profilePillClassNames, profileSectionTitleClassName } from "@/components/profile/profile-styles";

// Small presentational pieces shared by server sections and client
// components. Only lucide icons here, so importing this from a client
// component stays cheap (no next/image, no react-icons).

/** "Ada Lovelace" → "AL"; "McHacks 13" → "M" (numbers aren't initials). */
export function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word.match(/\p{L}/u)?.[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The standard profile section: a modest heading with an optional muted
 * aside on the right (a count, a filter, a hint), then the content.
 */
export function ProfileSection({
  title,
  aside,
  id,
  children,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
}) {
  const titleId = id ? `${id}-title` : undefined;

  return (
    <section aria-labelledby={titleId} className="scroll-mt-24" id={id}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className={profileSectionTitleClassName} id={titleId}>
          {title}
        </h2>
        {aside ? <div className="text-sm text-ink/55">{aside}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export type ProfileStatus = "winner" | "verified" | "self_reported";

/** The one status pill used by pinned cards and the attended table. */
export function ProfileStatusPill({ status }: { status: ProfileStatus }) {
  if (status === "winner") {
    return (
      <span className={profilePillClassNames.winner}>
        <Trophy aria-hidden="true" className="size-3" />
        Winner
      </span>
    );
  }

  if (status === "verified") {
    return (
      <span className={profilePillClassNames.verified}>
        <BadgeCheck aria-hidden="true" className="size-3" />
        Verified
      </span>
    );
  }

  return <span className={profilePillClassNames.selfReported}>Self-reported</span>;
}
